import { ErroDaLogistica, LogisticaMudouError } from "../domain/erros";
import { dataEmSaoPaulo } from "../domain/datas";
import { type OrigemDoHotel, podeTirarOrigem } from "../domain/hotel";
import { mensagemDaRecusa, type Periodo, periodoProprio, podeOcupar, podeTrocar, type QuartoDoRooming, type Sexo, sugerirRooming, textoDoPeriodo } from "../domain/rooming";
import type { AdicionarQuarto, AlterarHospedagem, CriarHospedagem, DefinirPeriodoDoOcupante, PorNoQuarto, TrocarDeQuarto } from "../domain/schemas";
import type { ContextoDaAcao } from "./pedidos";

// Hospedagem e rooming list (docs/07 §5.3): ocupantes < capacidade, sexo do quarto e pessoa na lista de quem precisa
// de hotel no evento (domain/hotel.ts: escala, pedido de voo ou acrescentada aqui). O ocupante é a PESSOA no evento;
// a escala não é exigida. O quarto é travado (FOR UPDATE) antes de contar as camas.
// O time monta os quartos; quem escolhe e reserva o hotel é a SDC. Por isso a hospedagem nasce sem hotel (local vazio)
// e ele entra no retorno do pedido (service/pedidos.ts). Apartamento da IAM é o caminho sem SDC.

export type QuartoTravado = QuartoDoRooming & { nome: string; hospedagemId: string; eventoId: string };

export type RegistroDaHospedagem = {
  hospedagemId: string;
  eventoId: string;
  acao: string;
  comentario?: string | null;
  dados?: Record<string, unknown>;
};

export type PessoaTravada = {
  pessoaId: string;
  nome: string;
  sexo: Sexo | null;
  staffAtivo: boolean;
  origens: OrigemDoHotel[];
  quartoId: string | null;
  convocacaoId: string | null;
};

export const MENSAGEM_FORA_DA_LISTA_DE_HOTEL =
  "Esta pessoa não está na lista de quem precisa de hotel neste evento. Acrescente-a na Hospedagem, marque \"Hotel\" na escala ou \"Também precisa de hotel\" no pedido de voo.";

async function pessoaDaLista(repo: RepositorioHospedagem, eventoId: string, pessoaId: string): Promise<PessoaTravada> {
  const pessoa = await repo.travarPessoaNoEvento(eventoId, pessoaId);
  if (!pessoa) throw new ErroDaLogistica("Pessoa não encontrada no cadastro de staff.");
  if (pessoa.origens.length === 0) throw new ErroDaLogistica(MENSAGEM_FORA_DA_LISTA_DE_HOTEL);
  return pessoa;
}

export type RepositorioHospedagem = {
  eventoExiste(eventoId: string): Promise<boolean>;
  localDeHospedagem(localId: string): Promise<{ tipo: string; arquivado: boolean } | null>;
  inserirHospedagem(hospedagem: CriarHospedagem & { usuarioId: string; instante: Date }): Promise<string>;
  travarHospedagem(hospedagemId: string): Promise<({ id: string; eventoId: string; localId: string | null; pedidoId: string | null; numeroReserva: string | null } & Periodo) | null>;
  quartosDaHospedagem(hospedagemId: string): Promise<number>;
  removerHospedagem(hospedagemId: string): Promise<void>;
  /** Quantos ocupantes têm período próprio que não cabe nestas datas. */
  periodosForaDe(hospedagemId: string, periodo: Periodo): Promise<number>;
  /** Compare-and-set pela versão da tela. false = outra pessoa mudou antes. */
  atualizarHospedagem(entrada: AlterarHospedagem, instante: Date): Promise<boolean>;
  quartoComNome(hospedagemId: string, nome: string): Promise<boolean>;
  inserirQuarto(quarto: AdicionarQuarto, instante: Date): Promise<string>;
  travarQuarto(quartoId: string): Promise<QuartoTravado | null>;
  travarQuartosDoEvento(eventoId: string): Promise<QuartoTravado[]>;
  removerQuarto(quartoId: string): Promise<void>;
  /** Evento para acrescentar gente à lista de hotel. Nulo = não existe ou foi apagado. `dataFim` no fuso de São Paulo. */
  eventoParaHospedar(eventoId: string): Promise<{ id: string; dataFim: string; cancelado: boolean } | null>;
  /**
   * A pessoa no evento, travada: origens de "precisa de hotel", quarto em que está e a convocação principal ativa (se
   * estiver na escala). Nulo = não é do cadastro de staff.
   */
  travarPessoaNoEvento(eventoId: string, pessoaId: string): Promise<PessoaTravada | null>;
  /** Na lista de quem precisa de hotel e ainda sem quarto. */
  semQuartoDoEvento(eventoId: string): Promise<{ pessoaId: string; sexo: Sexo | null }[]>;
  /** Tira a pessoa do quarto em que estiver neste evento e põe neste (uma cama por pessoa no evento). */
  porOcupante(quartoId: string, ocupante: { eventoId: string; pessoaId: string; convocacaoId: string | null }): Promise<void>;
  tirarOcupante(quartoId: string, pessoaId: string): Promise<boolean>;
  /** null = volta ao período da hospedagem. false = a pessoa já não está neste quarto. */
  definirPeriodoDoOcupante(quartoId: string, pessoaId: string, periodo: Periodo | null): Promise<boolean>;
  /** Acrescenta à lista pela Hospedagem. false = já estava acrescentada. */
  incluirAvulsa(entrada: { eventoId: string; pessoaId: string; usuarioId: string; instante: Date }): Promise<boolean>;
  removerAvulsa(eventoId: string, pessoaId: string): Promise<boolean>;
  /** Registro do evento (a lista de hotel existe antes de haver hospedagem aberta). */
  registrarDoEvento(registro: { eventoId: string; pessoaId: string; acao: string; dados?: Record<string, unknown>; usuarioId: string }): Promise<void>;
  registrar(registro: RegistroDaHospedagem & { usuarioId: string }): Promise<void>;
};

/** Sem `localId` não há o que conferir: o hotel fica para a SDC definir. Devolve o tipo do local escolhido. */
async function localValido(repo: RepositorioHospedagem, localId: string | undefined): Promise<string | null> {
  if (localId === undefined) return null;
  const local = await repo.localDeHospedagem(localId);
  if (!local || local.arquivado) throw new ErroDaLogistica("Local não encontrado. Escolha outro hotel ou apartamento.");
  if (local.tipo !== "HOTEL" && local.tipo !== "APARTAMENTO") throw new ErroDaLogistica("Escolha um hotel ou um apartamento, não um local de evento.");
  return local.tipo;
}

/** Primeiro passo da Hospedagem: abre a montagem dos quartos com as datas de entrada e saída. O hotel é opcional. */
export async function criarHospedagem(repo: RepositorioHospedagem, entrada: CriarHospedagem, { usuarioId, instante }: ContextoDaAcao): Promise<string> {
  if (!(await repo.eventoExiste(entrada.eventoId))) throw new ErroDaLogistica("Evento não encontrado.");
  await localValido(repo, entrada.localId);
  const id = await repo.inserirHospedagem({ ...entrada, usuarioId, instante });
  await repo.registrar({ hospedagemId: id, eventoId: entrada.eventoId, acao: "HOSPEDAGEM_CRIADA", usuarioId, dados: { localId: entrada.localId ?? null } });
  return id;
}

/** Desfaz uma hospedagem aberta por engano: só sem quartos e sem pedido à SDC. */
export async function removerHospedagem(repo: RepositorioHospedagem, hospedagemId: string, { usuarioId }: ContextoDaAcao): Promise<string> {
  const atual = await repo.travarHospedagem(hospedagemId);
  if (!atual) throw new ErroDaLogistica("Hospedagem não encontrada. Recarregue a página.");
  if (atual.pedidoId) throw new ErroDaLogistica("Esta hospedagem tem pedido à SDC. Cancele o pedido antes de removê-la.");
  if ((await repo.quartosDaHospedagem(atual.id)) > 0) throw new ErroDaLogistica("Remova os quartos antes de remover a hospedagem.");
  await repo.removerHospedagem(atual.id);
  await repo.registrar({ hospedagemId: atual.id, eventoId: atual.eventoId, acao: "HOSPEDAGEM_REMOVIDA", usuarioId, dados: { localId: atual.localId } });
  return atual.eventoId;
}

export async function alterarHospedagem(repo: RepositorioHospedagem, entrada: AlterarHospedagem, { usuarioId, instante }: ContextoDaAcao): Promise<string> {
  const atual = await repo.travarHospedagem(entrada.hospedagemId);
  if (!atual) throw new ErroDaLogistica("Hospedagem não encontrada. Recarregue a página.");
  const tipoDoLocal = await localValido(repo, entrada.localId);
  if (atual.numeroReserva && tipoDoLocal !== "HOTEL") throw new ErroDaLogistica("A SDC já reservou o hotel desta hospedagem: mantenha um hotel escolhido.");
  if (atual.pedidoId && tipoDoLocal === "APARTAMENTO") throw new ErroDaLogistica("Esta hospedagem tem pedido à SDC. Cancele o pedido antes de trocar para apartamento da IAM.");
  const fora = await repo.periodosForaDe(atual.id, { checkIn: entrada.checkIn, checkOut: entrada.checkOut });
  if (fora > 0) {
    throw new ErroDaLogistica(
      fora === 1
        ? "1 pessoa tem período próprio fora das novas datas. Ajuste o período dela antes de mudar a hospedagem."
        : `${fora} pessoas têm período próprio fora das novas datas. Ajuste o período delas antes de mudar a hospedagem.`,
    );
  }
  if (!(await repo.atualizarHospedagem(entrada, instante))) throw new LogisticaMudouError("a hospedagem mudou");
  await repo.registrar({ hospedagemId: atual.id, eventoId: atual.eventoId, acao: "HOSPEDAGEM_ALTERADA", usuarioId, dados: { localId: entrada.localId ?? null } });
  return atual.eventoId;
}

export async function adicionarQuarto(repo: RepositorioHospedagem, entrada: AdicionarQuarto, { usuarioId, instante }: ContextoDaAcao): Promise<string> {
  const hospedagem = await repo.travarHospedagem(entrada.hospedagemId);
  if (!hospedagem) throw new ErroDaLogistica("Hospedagem não encontrada. Recarregue a página.");
  if (await repo.quartoComNome(entrada.hospedagemId, entrada.nome)) throw new ErroDaLogistica(`Já existe um quarto chamado "${entrada.nome}" nesta hospedagem.`);
  const quartoId = await repo.inserirQuarto(entrada, instante);
  await repo.registrar({
    hospedagemId: hospedagem.id,
    eventoId: hospedagem.eventoId,
    acao: "QUARTO_ADICIONADO",
    usuarioId,
    dados: { quartoId, nome: entrada.nome, capacidade: entrada.capacidade, sexo: entrada.sexo ?? null },
  });
  return hospedagem.eventoId;
}

export async function removerQuarto(repo: RepositorioHospedagem, quartoId: string, { usuarioId }: ContextoDaAcao): Promise<string> {
  const quarto = await repo.travarQuarto(quartoId);
  if (!quarto) throw new ErroDaLogistica("Quarto não encontrado. Recarregue a página.");
  if (quarto.ocupantes.length > 0) throw new ErroDaLogistica(`Tire as pessoas do ${quarto.nome} antes de removê-lo.`);
  await repo.removerQuarto(quartoId);
  await repo.registrar({ hospedagemId: quarto.hospedagemId, eventoId: quarto.eventoId, acao: "QUARTO_REMOVIDO", usuarioId, dados: { quartoId, nome: quarto.nome } });
  return quarto.eventoId;
}

/** Põe no quarto ou move de um quarto para outro ("Mover para…"). */
export async function porNoQuarto(
  repo: RepositorioHospedagem,
  entrada: PorNoQuarto,
  { usuarioId }: ContextoDaAcao,
): Promise<{ eventoId: string; mudou: boolean; nomeDoQuarto: string }> {
  const quarto = await repo.travarQuarto(entrada.quartoId);
  if (!quarto) throw new ErroDaLogistica("Quarto não encontrado. Recarregue a página.");
  const pessoa = await pessoaDaLista(repo, quarto.eventoId, entrada.pessoaId);
  if (pessoa.quartoId === quarto.id) return { eventoId: quarto.eventoId, mudou: false, nomeDoQuarto: quarto.nome };

  const verificacao = podeOcupar(quarto, pessoa);
  if (!verificacao.ok) throw new ErroDaLogistica(mensagemDaRecusa(verificacao.motivo, quarto.nome));

  await repo.porOcupante(quarto.id, { eventoId: quarto.eventoId, pessoaId: pessoa.pessoaId, convocacaoId: pessoa.convocacaoId });
  await repo.registrar({
    hospedagemId: quarto.hospedagemId,
    eventoId: quarto.eventoId,
    acao: pessoa.quartoId ? "OCUPANTE_MOVIDO" : "OCUPANTE_INCLUIDO",
    usuarioId,
    dados: { pessoaId: pessoa.pessoaId, convocacaoId: pessoa.convocacaoId, quartoId: quarto.id, deQuartoId: pessoa.quartoId },
  });
  return { eventoId: quarto.eventoId, mudou: true, nomeDoQuarto: quarto.nome };
}

/**
 * Duas pessoas de quartos diferentes trocam de lugar em um passo (sem passar por "sem quarto"), mesmo com os dois
 * quartos cheios. Vale o mesmo que em porNoQuarto: as duas na lista de quem precisa de hotel no evento e o sexo do quarto.
 */
export async function trocarDeQuarto(
  repo: RepositorioHospedagem,
  entrada: TrocarDeQuarto,
  { usuarioId }: ContextoDaAcao,
): Promise<{ eventoId: string; nomeDoQuarto: string; nomeDoOutroQuarto: string }> {
  if (entrada.quartoId === entrada.comQuartoId) throw new ErroDaLogistica("As duas pessoas já estão no mesmo quarto.");
  if (entrada.pessoaId === entrada.comPessoaId) throw new ErroDaLogistica("Escolha outra pessoa para trocar de lugar.");

  // Sempre na mesma ordem (id), para duas trocas cruzadas não ficarem esperando uma pela outra.
  const travados = new Map<string, QuartoTravado | null>();
  for (const quartoId of [entrada.quartoId, entrada.comQuartoId].sort()) travados.set(quartoId, await repo.travarQuarto(quartoId));
  const quarto = travados.get(entrada.quartoId);
  const outroQuarto = travados.get(entrada.comQuartoId);
  if (!quarto || !outroQuarto) throw new ErroDaLogistica("Quarto não encontrado. Recarregue a página.");
  if (quarto.eventoId !== outroQuarto.eventoId) throw new ErroDaLogistica("Os dois quartos precisam ser do mesmo evento.");

  const pessoas = new Map<string, PessoaTravada | null>();
  for (const pessoaId of [entrada.pessoaId, entrada.comPessoaId].sort()) pessoas.set(pessoaId, await repo.travarPessoaNoEvento(quarto.eventoId, pessoaId));
  const pessoa = pessoas.get(entrada.pessoaId);
  const outraPessoa = pessoas.get(entrada.comPessoaId);
  // Alguém saiu do quarto (ou mudou de quarto) depois que a tela foi aberta.
  if (pessoa?.quartoId !== quarto.id || outraPessoa?.quartoId !== outroQuarto.id) throw new LogisticaMudouError("a pessoa já não estava no quarto");
  for (const daTroca of [pessoa, outraPessoa]) {
    if (daTroca.origens.length === 0) throw new ErroDaLogistica("Uma das pessoas saiu da lista de quem precisa de hotel: tire-a do quarto em vez de trocar.");
  }

  const verificacao = podeTrocar({ quarto, pessoa }, { quarto: outroQuarto, pessoa: outraPessoa });
  if (!verificacao.ok) throw new ErroDaLogistica(mensagemDaRecusa(verificacao.motivo, verificacao.quartoId === quarto.id ? quarto.nome : outroQuarto.nome));

  await repo.porOcupante(outroQuarto.id, { eventoId: quarto.eventoId, pessoaId: pessoa.pessoaId, convocacaoId: pessoa.convocacaoId });
  await repo.porOcupante(quarto.id, { eventoId: quarto.eventoId, pessoaId: outraPessoa.pessoaId, convocacaoId: outraPessoa.convocacaoId });
  const dados = { pessoaId: pessoa.pessoaId, quartoId: outroQuarto.id, comPessoaId: outraPessoa.pessoaId, comQuartoId: quarto.id };
  for (const hospedagemId of new Set([quarto.hospedagemId, outroQuarto.hospedagemId])) {
    await repo.registrar({ hospedagemId, eventoId: quarto.eventoId, acao: "OCUPANTES_TROCADOS", usuarioId, dados });
  }
  return { eventoId: quarto.eventoId, nomeDoQuarto: outroQuarto.nome, nomeDoOutroQuarto: quarto.nome };
}

export async function tirarDoQuarto(repo: RepositorioHospedagem, entrada: PorNoQuarto, { usuarioId }: ContextoDaAcao): Promise<string> {
  const quarto = await repo.travarQuarto(entrada.quartoId);
  if (!quarto) throw new ErroDaLogistica("Quarto não encontrado. Recarregue a página.");
  if (!(await repo.tirarOcupante(quarto.id, entrada.pessoaId))) throw new LogisticaMudouError("a pessoa já não estava no quarto");
  await repo.registrar({
    hospedagemId: quarto.hospedagemId,
    eventoId: quarto.eventoId,
    acao: "OCUPANTE_RETIRADO",
    usuarioId,
    dados: { pessoaId: entrada.pessoaId, quartoId: quarto.id },
  });
  return quarto.eventoId;
}

/** Período de quem chega depois ou sai antes. Sem datas, ou com as datas da hospedagem, volta a acompanhá-la. */
export async function definirPeriodoDoOcupante(
  repo: RepositorioHospedagem,
  entrada: DefinirPeriodoDoOcupante,
  { usuarioId }: ContextoDaAcao,
): Promise<{ eventoId: string; periodo: Periodo | null }> {
  const quarto = await repo.travarQuarto(entrada.quartoId);
  if (!quarto) throw new ErroDaLogistica("Quarto não encontrado. Recarregue a página.");
  const hospedagem = await repo.travarHospedagem(quarto.hospedagemId);
  if (!hospedagem) throw new ErroDaLogistica("Hospedagem não encontrada. Recarregue a página.");

  const pedido = entrada.checkIn && entrada.checkOut ? { checkIn: entrada.checkIn, checkOut: entrada.checkOut } : null;
  const resultado = periodoProprio(hospedagem, pedido);
  if (!resultado.ok) {
    throw new ErroDaLogistica(`O período da pessoa precisa ficar dentro da hospedagem (${textoDoPeriodo(hospedagem)}). Para mais dias, mude antes as datas da hospedagem.`);
  }
  if (!(await repo.definirPeriodoDoOcupante(quarto.id, entrada.pessoaId, resultado.periodo))) throw new LogisticaMudouError("a pessoa já não estava no quarto");
  await repo.registrar({
    hospedagemId: quarto.hospedagemId,
    eventoId: quarto.eventoId,
    acao: "PERIODO_DO_OCUPANTE_DEFINIDO",
    usuarioId,
    dados: { pessoaId: entrada.pessoaId, quartoId: quarto.id, checkIn: resultado.periodo?.checkIn ?? null, checkOut: resultado.periodo?.checkOut ?? null },
  });
  return { eventoId: quarto.eventoId, periodo: resultado.periodo };
}

/** Aplica a sugestão por sexo a quem está sem quarto. Devolve quantas pessoas foram alocadas e quantas não couberam. */
export async function aplicarRoomingSugerido(
  repo: RepositorioHospedagem,
  eventoId: string,
  { usuarioId }: ContextoDaAcao,
): Promise<{ alocadas: number; semLugar: number }> {
  const quartos = await repo.travarQuartosDoEvento(eventoId);
  if (quartos.length === 0) throw new ErroDaLogistica("Crie os quartos antes de sugerir o rooming.");
  const sugestao = sugerirRooming(await repo.semQuartoDoEvento(eventoId), quartos);
  for (const alocacao of sugestao.alocacoes) {
    const pessoa = await repo.travarPessoaNoEvento(eventoId, alocacao.pessoaId);
    await repo.porOcupante(alocacao.quartoId, { eventoId, pessoaId: alocacao.pessoaId, convocacaoId: pessoa?.convocacaoId ?? null });
  }
  const hospedagens = [...new Set(quartos.filter((quarto) => sugestao.alocacoes.some((alocacao) => alocacao.quartoId === quarto.id)).map((quarto) => quarto.hospedagemId))];
  for (const hospedagemId of hospedagens) {
    await repo.registrar({
      hospedagemId,
      eventoId,
      acao: "ROOMING_SUGERIDO_APLICADO",
      usuarioId,
      dados: { alocacoes: sugestao.alocacoes.filter((alocacao) => quartos.find((quarto) => quarto.id === alocacao.quartoId)?.hospedagemId === hospedagemId) },
    });
  }
  return { alocadas: sugestao.alocacoes.length, semLugar: sugestao.semLugar.length };
}

/**
 * Acrescenta alguém à lista de quem precisa de hotel direto na Hospedagem, sem escala nem pedido de voo. Mesma regra
 * do pedido de voo: qualquer pessoa ativa do cadastro de staff, qualquer evento futuro não cancelado.
 */
export async function acrescentarHospede(
  repo: RepositorioHospedagem,
  entrada: { eventoId: string; pessoaId: string },
  { usuarioId, instante }: ContextoDaAcao,
): Promise<{ nome: string; mudou: boolean }> {
  const evento = await repo.eventoParaHospedar(entrada.eventoId);
  if (!evento) throw new ErroDaLogistica("Evento não encontrado. Recarregue a página.");
  if (evento.cancelado) throw new ErroDaLogistica("Este evento foi cancelado: não dá para pedir hotel para ele.");
  if (evento.dataFim < dataEmSaoPaulo(instante)) throw new ErroDaLogistica("Este evento já terminou: não dá para pedir hotel para ele.");
  const pessoa = await repo.travarPessoaNoEvento(evento.id, entrada.pessoaId);
  if (!pessoa || !pessoa.staffAtivo) throw new ErroDaLogistica("Esta pessoa não está ativa no cadastro de staff. Confira em Pessoas.");
  if (!(await repo.incluirAvulsa({ eventoId: evento.id, pessoaId: pessoa.pessoaId, usuarioId, instante }))) return { nome: pessoa.nome, mudou: false };
  await repo.registrarDoEvento({ eventoId: evento.id, pessoaId: pessoa.pessoaId, acao: "HOSPEDE_ACRESCENTADO", usuarioId, dados: { origens: pessoa.origens } });
  return { nome: pessoa.nome, mudou: true };
}

/**
 * Tira da lista quem foi acrescentado pela Hospedagem. Se a pessoa também está na lista pela escala ou por um pedido
 * de voo, continua nela (e no quarto). Se esta era a única origem e ela está num quarto, é recusado.
 */
export async function tirarHospede(repo: RepositorioHospedagem, entrada: { eventoId: string; pessoaId: string }, { usuarioId }: ContextoDaAcao): Promise<{ nome: string; continuaNaLista: boolean }> {
  const pessoa = await repo.travarPessoaNoEvento(entrada.eventoId, entrada.pessoaId);
  if (!pessoa) throw new ErroDaLogistica("Pessoa não encontrada no cadastro de staff.");
  const verificacao = podeTirarOrigem({ origens: pessoa.origens, noQuarto: pessoa.quartoId !== null }, "AVULSA");
  if (!verificacao.ok) {
    throw verificacao.motivo === "NO_QUARTO"
      ? new ErroDaLogistica(`${pessoa.nome} está num quarto. Tire a pessoa do quarto antes de tirá-la da lista.`)
      : new LogisticaMudouError("a pessoa já não estava acrescentada");
  }
  if (!(await repo.removerAvulsa(entrada.eventoId, pessoa.pessoaId))) throw new LogisticaMudouError("a pessoa já não estava acrescentada");
  await repo.registrarDoEvento({ eventoId: entrada.eventoId, pessoaId: pessoa.pessoaId, acao: "HOSPEDE_RETIRADO", usuarioId });
  return { nome: pessoa.nome, continuaNaLista: pessoa.origens.some((origem) => origem !== "AVULSA") };
}
