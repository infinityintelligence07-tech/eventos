import { ErroDaLogistica, LogisticaMudouError } from "../domain/erros";
import { mensagemDaRecusa, podeOcupar, type QuartoDoRooming, type Sexo, sugerirRooming } from "../domain/rooming";
import type { AdicionarQuarto, AlterarHospedagem, CriarHospedagem, PorNoQuarto } from "../domain/schemas";
import type { ContextoDaAcao } from "./pedidos";

// Hospedagem e rooming list (docs/07 §5.3): ocupantes < capacidade, sexo do quarto, convocação ativa do mesmo
// evento. O quarto é travado (FOR UPDATE) antes de contar as camas.

export type QuartoTravado = QuartoDoRooming & { nome: string; hospedagemId: string; eventoId: string };

export type RegistroDaHospedagem = {
  hospedagemId: string;
  eventoId: string;
  acao: string;
  comentario?: string | null;
  dados?: Record<string, unknown>;
};

export type RepositorioHospedagem = {
  eventoExiste(eventoId: string): Promise<boolean>;
  localDeHospedagem(localId: string): Promise<{ tipo: string; arquivado: boolean } | null>;
  inserirHospedagem(hospedagem: CriarHospedagem & { usuarioId: string; instante: Date }): Promise<string>;
  travarHospedagem(hospedagemId: string): Promise<{ id: string; eventoId: string } | null>;
  /** Compare-and-set pela versão da tela. false = outra pessoa mudou antes. */
  atualizarHospedagem(entrada: AlterarHospedagem, instante: Date): Promise<boolean>;
  quartoComNome(hospedagemId: string, nome: string): Promise<boolean>;
  inserirQuarto(quarto: AdicionarQuarto, instante: Date): Promise<string>;
  travarQuarto(quartoId: string): Promise<QuartoTravado | null>;
  travarQuartosDoEvento(eventoId: string): Promise<QuartoTravado[]>;
  removerQuarto(quartoId: string): Promise<void>;
  travarConvocacao(convocacaoId: string): Promise<{ convocacaoId: string; eventoId: string; ativa: boolean; sexo: Sexo | null; quartoId: string | null } | null>;
  semQuartoDoEvento(eventoId: string): Promise<{ convocacaoId: string; sexo: Sexo | null }[]>;
  /** Tira a convocação do quarto em que estiver e põe neste (uma cama por convocação). */
  porOcupante(quartoId: string, convocacaoId: string): Promise<void>;
  tirarOcupante(quartoId: string, convocacaoId: string): Promise<boolean>;
  registrar(registro: RegistroDaHospedagem & { usuarioId: string }): Promise<void>;
};

async function localValido(repo: RepositorioHospedagem, localId: string): Promise<void> {
  const local = await repo.localDeHospedagem(localId);
  if (!local || local.arquivado) throw new ErroDaLogistica("Local não encontrado. Escolha outro hotel ou apartamento.");
  if (local.tipo !== "HOTEL" && local.tipo !== "APARTAMENTO") throw new ErroDaLogistica("Escolha um hotel ou um apartamento, não um local de evento.");
}

export async function criarHospedagem(repo: RepositorioHospedagem, entrada: CriarHospedagem, { usuarioId, instante }: ContextoDaAcao): Promise<string> {
  if (!(await repo.eventoExiste(entrada.eventoId))) throw new ErroDaLogistica("Evento não encontrado.");
  await localValido(repo, entrada.localId);
  const id = await repo.inserirHospedagem({ ...entrada, usuarioId, instante });
  await repo.registrar({ hospedagemId: id, eventoId: entrada.eventoId, acao: "HOSPEDAGEM_CRIADA", usuarioId, dados: { localId: entrada.localId } });
  return id;
}

export async function alterarHospedagem(repo: RepositorioHospedagem, entrada: AlterarHospedagem, { usuarioId, instante }: ContextoDaAcao): Promise<string> {
  const atual = await repo.travarHospedagem(entrada.hospedagemId);
  if (!atual) throw new ErroDaLogistica("Hospedagem não encontrada. Recarregue a página.");
  await localValido(repo, entrada.localId);
  if (!(await repo.atualizarHospedagem(entrada, instante))) throw new LogisticaMudouError("a hospedagem mudou");
  await repo.registrar({ hospedagemId: atual.id, eventoId: atual.eventoId, acao: "HOSPEDAGEM_ALTERADA", usuarioId, dados: { localId: entrada.localId } });
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
  const convocacao = await repo.travarConvocacao(entrada.convocacaoId);
  if (!convocacao || convocacao.eventoId !== quarto.eventoId) throw new ErroDaLogistica("Esta pessoa não está na escala deste evento.");
  if (!convocacao.ativa) throw new ErroDaLogistica("A pessoa saiu da escala deste evento: não dá para pôr no quarto.");
  if (convocacao.quartoId === quarto.id) return { eventoId: quarto.eventoId, mudou: false, nomeDoQuarto: quarto.nome };

  const verificacao = podeOcupar(quarto, convocacao);
  if (!verificacao.ok) throw new ErroDaLogistica(mensagemDaRecusa(verificacao.motivo, quarto.nome));

  await repo.porOcupante(quarto.id, convocacao.convocacaoId);
  await repo.registrar({
    hospedagemId: quarto.hospedagemId,
    eventoId: quarto.eventoId,
    acao: convocacao.quartoId ? "OCUPANTE_MOVIDO" : "OCUPANTE_INCLUIDO",
    usuarioId,
    dados: { convocacaoId: convocacao.convocacaoId, quartoId: quarto.id, deQuartoId: convocacao.quartoId },
  });
  return { eventoId: quarto.eventoId, mudou: true, nomeDoQuarto: quarto.nome };
}

export async function tirarDoQuarto(repo: RepositorioHospedagem, entrada: PorNoQuarto, { usuarioId }: ContextoDaAcao): Promise<string> {
  const quarto = await repo.travarQuarto(entrada.quartoId);
  if (!quarto) throw new ErroDaLogistica("Quarto não encontrado. Recarregue a página.");
  if (!(await repo.tirarOcupante(quarto.id, entrada.convocacaoId))) throw new LogisticaMudouError("a pessoa já não estava no quarto");
  await repo.registrar({
    hospedagemId: quarto.hospedagemId,
    eventoId: quarto.eventoId,
    acao: "OCUPANTE_RETIRADO",
    usuarioId,
    dados: { convocacaoId: entrada.convocacaoId, quartoId: quarto.id },
  });
  return quarto.eventoId;
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
    await repo.porOcupante(alocacao.quartoId, alocacao.convocacaoId);
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
