import { convocacaoAtiva, EscalaMudouError, type StatusEscala } from "../domain/convite";
import { transicaoDaConvocacao } from "../domain/convocacao";
import { ConflitoDeAgendaError, EscalaTravadaError, NaoEncontradoError, TransicaoInvalidaError, VagasEsgotadasError } from "../domain/erros";
import type { Deslocamento } from "../domain/schemas";
import { escalaEditavel, eventoEncerrado } from "../domain/status-escala";
import { calcularVagas, RegraVagasInvalidaError } from "../domain/vagas";
import type { EventoTravado, LinhaTravada, RepositorioMontagem } from "./portas";

// Casos de uso de "Montar escala" (docs/07 §6.2). Cada um trava o evento, confere se a escala é editável
// (SEM_ESCALA, RASCUNHO, DEVOLVIDA) e grava; SEM_ESCALA vira RASCUNHO na primeira mudança.

function motivoDaTrava(status: StatusEscala): string {
  switch (status) {
    case "AGUARDANDO_APROVACAO":
      return "A escala está com a líder para aprovação. Espere aprovar ou devolver para mudar.";
    case "APROVADA":
    case "COMUNICADA":
      return "A escala já foi aprovada. Reabra a escala para mudar.";
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "DEVOLVIDA":
      return "A escala não pode ser alterada agora.";
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

export async function travarEventoEditavel(repo: RepositorioMontagem, eventoId: string, instante: Date): Promise<EventoTravado> {
  const evento = await repo.travarEvento(eventoId);
  if (!evento) throw new NaoEncontradoError("Evento não encontrado.");
  if (eventoEncerrado(evento.status)) throw new EscalaTravadaError("O evento foi cancelado ou já terminou. A escala fica só para consulta.");
  if (!escalaEditavel(evento.statusEscala)) throw new EscalaTravadaError(motivoDaTrava(evento.statusEscala));
  if (evento.statusEscala === "SEM_ESCALA") await repo.comecarRascunho(eventoId, instante);
  return evento;
}

async function linhaDoEvento(repo: RepositorioMontagem, eventoId: string, escalaId: string): Promise<LinhaTravada> {
  const linha = await repo.travarLinha(escalaId);
  if (!linha || linha.eventoId !== eventoId) throw new NaoEncontradoError("Esta função não está mais na escala. Recarregue a página.");
  return linha;
}

export async function confirmarVagas(
  repo: RepositorioMontagem,
  { eventoId, linhas, usuarioId, instante }: { eventoId: string; linhas: { escalaId: string; quantidade: number }[]; usuarioId: string; instante: Date },
): Promise<{ confirmadas: number }> {
  await travarEventoEditavel(repo, eventoId, instante);
  for (const { escalaId, quantidade } of linhas) {
    const linha = await linhaDoEvento(repo, eventoId, escalaId);
    await repo.definirVagas(escalaId, { quantidade, confirmadaPor: usuarioId, instante });
    await registrarVaga(repo, linha, { acao: "VAGAS_CONFIRMADAS", para: quantidade, usuarioId });
  }
  return { confirmadas: linhas.length };
}

/** Mudar o número desfaz a confirmação: quem monta confirma de novo. */
export async function alterarVagas(
  repo: RepositorioMontagem,
  { eventoId, escalaId, quantidade, usuarioId, instante }: { eventoId: string; escalaId: string; quantidade: number; usuarioId: string; instante: Date },
): Promise<void> {
  await travarEventoEditavel(repo, eventoId, instante);
  const linha = await linhaDoEvento(repo, eventoId, escalaId);
  await repo.definirVagas(escalaId, { quantidade, confirmadaPor: null, instante });
  await registrarVaga(repo, linha, { acao: "VAGAS_ALTERADAS", para: quantidade, usuarioId });
}

/** Função da regra sem número (`digitado`): cria a linha já confirmada, ou corrige e confirma a existente. */
export async function definirVagaDigitada(
  repo: RepositorioMontagem,
  { eventoId, funcao, quantidade, usuarioId, instante }: { eventoId: string; funcao: string; quantidade: number; usuarioId: string; instante: Date },
): Promise<{ escalaId: string }> {
  const evento = await travarEventoEditavel(repo, eventoId, instante);
  let digitada = false;
  try {
    digitada = calcularVagas(evento.regraVagas, {}).pendencias.some((pendencia) => pendencia.funcao === funcao && "digitar" in pendencia);
  } catch (cause: unknown) {
    if (!(cause instanceof RegraVagasInvalidaError)) throw cause;
  }
  if (!digitada) throw new NaoEncontradoError("Esta função não é digitada na regra deste tipo de evento.");

  const existente = (await repo.linhasDoEvento(eventoId)).find((linha) => linha.funcao === funcao && linha.origem === "REGRA");
  if (existente) {
    await repo.definirVagas(existente.id, { quantidade, confirmadaPor: usuarioId, instante });
    await repo.registrar({ entidade: "VAGA", entidadeId: existente.id, eventoId, acao: "VAGA_DIGITADA", usuarioId, dados: { funcao, de: existente.quantidade, para: quantidade } });
    return { escalaId: existente.id };
  }
  const cadastrada = await repo.funcaoPorCodigo(funcao);
  if (!cadastrada) throw new NaoEncontradoError("A função não está cadastrada.");
  const escalaId = await repo.inserirLinha({
    eventoId,
    funcaoId: cadastrada.id,
    data: evento.dataInicio,
    quantidade,
    origem: "REGRA",
    confirmadaPor: usuarioId,
    instante,
  });
  await repo.registrar({ entidade: "VAGA", entidadeId: escalaId, eventoId, acao: "VAGA_DIGITADA", usuarioId, dados: { funcao, de: null, para: quantidade } });
  return { escalaId };
}

export async function adicionarVagaManual(
  repo: RepositorioMontagem,
  entrada: { eventoId: string; funcaoId: string; data: string; quantidade: number; usuarioId: string; instante: Date },
): Promise<{ escalaId: string; nomeDaFuncao: string }> {
  const evento = await travarEventoEditavel(repo, entrada.eventoId, entrada.instante);
  if (entrada.data < evento.dataInicio || entrada.data > evento.dataFim) {
    throw new TransicaoInvalidaError("Escolha um dia dentro das datas do evento.");
  }
  const funcao = await repo.funcaoPorId(entrada.funcaoId);
  if (!funcao) throw new NaoEncontradoError("A função não está cadastrada.");
  const repetida = (await repo.linhasDoEvento(entrada.eventoId)).some((linha) => linha.funcaoId === funcao.id && linha.data === entrada.data);
  if (repetida) throw new TransicaoInvalidaError(`${funcao.nome} já está na escala neste dia. Ajuste o número de vagas na linha dela.`);

  const escalaId = await repo.inserirLinha({ ...entrada, origem: "MANUAL", confirmadaPor: entrada.usuarioId });
  await repo.registrar({
    entidade: "VAGA",
    entidadeId: escalaId,
    eventoId: entrada.eventoId,
    acao: "VAGA_MANUAL_ADICIONADA",
    usuarioId: entrada.usuarioId,
    dados: { funcao: funcao.nome, data: entrada.data, quantidade: entrada.quantidade },
  });
  return { escalaId, nomeDaFuncao: funcao.nome };
}

export async function removerVagaManual(
  repo: RepositorioMontagem,
  { eventoId, escalaId, usuarioId, instante }: { eventoId: string; escalaId: string; usuarioId: string; instante: Date },
): Promise<{ nomeDaFuncao: string }> {
  await travarEventoEditavel(repo, eventoId, instante);
  const linha = await linhaDoEvento(repo, eventoId, escalaId);
  if (linha.origem !== "MANUAL") throw new TransicaoInvalidaError("Funções da regra não são removidas. Ajuste o número de vagas.");
  if (linha.ativas > 0) throw new TransicaoInvalidaError(`Tire as pessoas de ${linha.nomeDaFuncao} antes de remover a função.`);
  await repo.apagarLinha(escalaId, instante);
  await repo.registrar({
    entidade: "VAGA",
    entidadeId: escalaId,
    eventoId,
    acao: "VAGA_MANUAL_REMOVIDA",
    usuarioId,
    dados: { funcao: linha.nomeDaFuncao, data: linha.data, quantidade: linha.quantidade },
  });
  return { nomeDaFuncao: linha.nomeDaFuncao };
}

export async function porNaVaga(
  repo: RepositorioMontagem,
  entrada: { eventoId: string; escalaId: string; pessoaId: string; sugestaoScore: number | null; usuarioId: string; instante: Date },
): Promise<{ convocacaoId: string; nome: string; nomeDaFuncao: string }> {
  await travarEventoEditavel(repo, entrada.eventoId, entrada.instante);
  const linha = await linhaDoEvento(repo, entrada.eventoId, entrada.escalaId);
  const pessoa = await repo.pessoaEscalavel(entrada.pessoaId);
  if (!pessoa) throw new NaoEncontradoError("Pessoa não encontrada no cadastro de staff.");

  const existente = await repo.convocacaoNaLinha(entrada.escalaId, entrada.pessoaId);
  const transicao = transicaoDaConvocacao(existente?.status ?? null, "POR_NA_VAGA");
  if ("erro" in transicao || "apagar" in transicao) throw new TransicaoInvalidaError(`${pessoa.nome} já está em ${linha.nomeDaFuncao}.`);

  if (linha.ativas >= linha.quantidade) {
    throw new VagasEsgotadasError(`As ${linha.quantidade} vagas de ${linha.nomeDaFuncao} já estão preenchidas. Aumente o número de vagas antes.`);
  }
  if (await repo.ativaEmOutraLinhaDoEvento(entrada.eventoId, entrada.escalaId, entrada.pessoaId)) {
    throw new ConflitoDeAgendaError(`${pessoa.nome} já está em outra função deste evento.`);
  }
  const conflitos = await repo.conflitosDeAgenda(entrada.eventoId, entrada.pessoaId);
  if (conflitos.length > 0) throw new ConflitoDeAgendaError(`${pessoa.nome} já está na escala de ${conflitos.join(", ")}, com datas que coincidem.`);

  const dados = { usuarioId: entrada.usuarioId, sugestaoScore: entrada.sugestaoScore, instante: entrada.instante };
  const incluida = (convocacaoId: string, de: string | null) =>
    repo.registrar({
      entidade: "CONVOCACAO",
      entidadeId: convocacaoId,
      eventoId: entrada.eventoId,
      acao: "CONVOCACAO_INCLUIDA",
      statusDe: de,
      statusPara: "SUGERIDA",
      usuarioId: entrada.usuarioId,
      dados: { funcao: linha.nomeDaFuncao },
    });
  if (existente) {
    if (!(await repo.reativarConvocacao(existente.id, { de: existente.status, ...dados }))) throw new EscalaMudouError("a convocação mudou");
    await incluida(existente.id, existente.status);
    return { convocacaoId: existente.id, nome: pessoa.nome, nomeDaFuncao: linha.nomeDaFuncao };
  }
  const convocacaoId = await repo.inserirConvocacao({ escalaId: entrada.escalaId, pessoaId: entrada.pessoaId, ...dados });
  await incluida(convocacaoId, null);
  return { convocacaoId, nome: pessoa.nome, nomeDaFuncao: linha.nomeDaFuncao };
}

/** Nunca avisada (SUGERIDA): a linha some. Já avisada: vira CANCELADA e guarda o histórico. */
export async function tirarDaVaga(
  repo: RepositorioMontagem,
  { eventoId, convocacaoId, usuarioId, instante }: { eventoId: string; convocacaoId: string; usuarioId: string; instante: Date },
): Promise<{ nome: string; jaAvisada: boolean }> {
  await travarEventoEditavel(repo, eventoId, instante);
  const convocacao = await repo.travarConvocacao(convocacaoId);
  if (!convocacao || convocacao.eventoId !== eventoId) throw new NaoEncontradoError("A pessoa não está mais nesta escala.");

  const transicao = transicaoDaConvocacao(convocacao.status, "TIRAR_DA_VAGA");
  if ("erro" in transicao) throw new TransicaoInvalidaError(`${convocacao.nome} já não ocupa a vaga.`);
  if ("apagar" in transicao) {
    if (!(await repo.apagarConvocacao(convocacaoId, convocacao.status))) throw new EscalaMudouError("a convocação mudou");
    await repo.registrar({ entidade: "CONVOCACAO", entidadeId: convocacaoId, eventoId, acao: "CONVOCACAO_REMOVIDA", statusDe: convocacao.status, usuarioId });
    return { nome: convocacao.nome, jaAvisada: false };
  }
  if (!(await repo.mudarConvocacao(convocacaoId, { de: convocacao.status, para: transicao.para, instante }))) {
    throw new EscalaMudouError("a convocação mudou");
  }
  await repo.registrar({
    entidade: "CONVOCACAO",
    entidadeId: convocacaoId,
    eventoId,
    acao: "CANCELADA",
    statusDe: convocacao.status,
    statusPara: transicao.para,
    usuarioId,
  });
  return { nome: convocacao.nome, jaAvisada: true };
}

/** Deslocamento é dado de logística: muda em qualquer momento, menos com a escala na mão da líder. */
export async function definirDeslocamento(
  repo: RepositorioMontagem,
  {
    eventoId,
    convocacaoId,
    deslocamento,
    usuarioId,
    instante,
  }: { eventoId: string; convocacaoId: string; deslocamento: Deslocamento | null; usuarioId: string; instante: Date },
): Promise<void> {
  const evento = await repo.travarEvento(eventoId);
  if (!evento) throw new NaoEncontradoError("Evento não encontrado.");
  if (eventoEncerrado(evento.status)) throw new EscalaTravadaError("O evento foi cancelado ou já terminou. A escala fica só para consulta.");
  if (evento.statusEscala === "AGUARDANDO_APROVACAO") throw new EscalaTravadaError(motivoDaTrava(evento.statusEscala));
  const convocacao = await repo.travarConvocacao(convocacaoId);
  if (!convocacao || convocacao.eventoId !== eventoId || !convocacaoAtiva(convocacao.status)) {
    throw new NaoEncontradoError("A pessoa não está mais nesta escala.");
  }
  await repo.definirDeslocamento(convocacaoId, deslocamento, instante);
  // Só o deslocamento leva valor (docs/09 §7.1): é logística, não dado pessoal.
  await repo.registrar({
    entidade: "CONVOCACAO",
    entidadeId: convocacaoId,
    eventoId,
    acao: "CONVOCACAO_ATUALIZADA",
    usuarioId,
    dados: { campos: ["deslocamento"], deslocamento },
  });
}

async function registrarVaga(
  repo: RepositorioMontagem,
  linha: LinhaTravada,
  { acao, para, usuarioId }: { acao: "VAGAS_CONFIRMADAS" | "VAGAS_ALTERADAS"; para: number; usuarioId: string },
): Promise<void> {
  await repo.registrar({
    entidade: "VAGA",
    entidadeId: linha.id,
    eventoId: linha.eventoId,
    acao,
    usuarioId,
    dados: { funcao: linha.funcao ?? linha.nomeDaFuncao, de: linha.quantidade, para },
  });
}
