import {
  EnqueteFechadaParaRespostaError,
  EnqueteJaEncerradaError,
  EnqueteNaoEncontradaError,
  EventoInexistenteError,
  FechamentoNoPassadoError,
  situacaoDaEnquete,
} from "../domain/enquete";
import {
  EventoForaDaEnqueteError,
  type MudancaDeResposta,
  PessoaForaDaEnqueteError,
  planoDoRegistro,
  type Resposta,
  type RespostaAtual,
  respostaDe,
} from "../domain/respostas";

/** Tudo roda no executor recebido (a transação do fluxo). `travarEnquete` trava a linha (FOR UPDATE). */
export type RepositorioEnquete = {
  eventosExistentes(eventoIds: string[]): Promise<string[]>;
  criarEnquete(dados: { titulo: string; fechaEm: Date; eventoIds: string[]; criadoPor: string }): Promise<string>;
  travarEnquete(enqueteId: string): Promise<{ fechaEm: Date; eventoIds: string[] } | null>;
  alterarEnquete(enqueteId: string, dados: { titulo?: string; fechaEm?: Date }): Promise<void>;
  /** Compare-and-set: só encerra se ainda estiver aberta. false = já tinha fechado. */
  encerrarEnquete(enqueteId: string, agora: Date): Promise<boolean>;
  /** Nome do staff ativo (pessoa_evento + core.pessoa ativa); nulo se não for. */
  staffAtivo(pessoaId: string): Promise<{ nome: string } | null>;
  respostasDaPessoa(pessoaId: string, eventoIds: string[]): Promise<Map<string, RespostaAtual>>;
  /** `registradoPor` nulo = a própria pessoa respondeu. */
  gravarResposta(dados: { enqueteId: string; eventoId: string; pessoaId: string; disponivel: boolean; instante: Date; registradoPor: string | null }): Promise<void>;
  apagarResposta(eventoId: string, pessoaId: string): Promise<void>;
  registrarMudanca(dados: {
    enqueteId: string;
    pessoaId: string;
    usuarioId: string;
    mudanca: MudancaDeResposta;
    para: Resposta;
    foraDoPrazo: boolean;
    /** A própria pessoa respondeu pelo link. */
    propria?: boolean;
  }): Promise<void>;
  /** O registro pedido não mudou nada: fica a trilha de quem conferiu (toda escrita registra, docs/09 §7.2). */
  registrarSemMudanca(dados: { enqueteId: string; pessoaId: string; usuarioId: string; propria?: boolean }): Promise<void>;
  registrarEnquete(dados: {
    enqueteId: string;
    acao: "ENQUETE_ABERTA" | "ENQUETE_ALTERADA" | "ENQUETE_REABERTA" | "ENQUETE_ENCERRADA";
    usuarioId: string;
    dados: Record<string, unknown>;
  }): Promise<void>;
};

export async function abrirEnquete(
  repo: RepositorioEnquete,
  { titulo, fechaEm, eventoIds, usuarioId, agora }: { titulo: string; fechaEm: Date; eventoIds: string[]; usuarioId: string; agora: Date },
): Promise<string> {
  if (situacaoDaEnquete(fechaEm, agora) !== "ABERTA") throw new FechamentoNoPassadoError();
  const existentes = new Set(await repo.eventosExistentes(eventoIds));
  const faltando = eventoIds.filter((eventoId) => !existentes.has(eventoId));
  if (faltando.length > 0) throw new EventoInexistenteError(faltando);
  const enqueteId = await repo.criarEnquete({ titulo, fechaEm, eventoIds, criadoPor: usuarioId });
  await repo.registrarEnquete({ enqueteId, acao: "ENQUETE_ABERTA", usuarioId, dados: { eventoIds, fechaEm: fechaEm.toISOString() } });
  return enqueteId;
}

export async function alterarEnquete(
  repo: RepositorioEnquete,
  { enqueteId, titulo, fechaEm, usuarioId, agora }: { enqueteId: string; titulo?: string; fechaEm?: Date; usuarioId: string; agora: Date },
): Promise<void> {
  const antes = await repo.travarEnquete(enqueteId);
  if (!antes) throw new EnqueteNaoEncontradaError(enqueteId);
  if (fechaEm && situacaoDaEnquete(fechaEm, agora) !== "ABERTA") throw new FechamentoNoPassadoError();
  await repo.alterarEnquete(enqueteId, { titulo, fechaEm });
  const reabriu = fechaEm !== undefined && situacaoDaEnquete(antes.fechaEm, agora) === "ENCERRADA";
  await repo.registrarEnquete({
    enqueteId,
    acao: reabriu ? "ENQUETE_REABERTA" : "ENQUETE_ALTERADA",
    usuarioId,
    dados: {
      campos: [titulo !== undefined ? "titulo" : null, fechaEm !== undefined ? "fechaEm" : null].filter(Boolean),
      ...(fechaEm ? { fechaEmDe: antes.fechaEm.toISOString(), fechaEmPara: fechaEm.toISOString() } : {}),
    },
  });
}

export async function encerrarEnquete(
  repo: RepositorioEnquete,
  { enqueteId, usuarioId, agora }: { enqueteId: string; usuarioId: string; agora: Date },
): Promise<void> {
  const enquete = await repo.travarEnquete(enqueteId);
  if (!enquete) throw new EnqueteNaoEncontradaError(enqueteId);
  if (situacaoDaEnquete(enquete.fechaEm, agora) === "ENCERRADA" || !(await repo.encerrarEnquete(enqueteId, agora))) {
    throw new EnqueteJaEncerradaError(enqueteId);
  }
  await repo.registrarEnquete({
    enqueteId,
    acao: "ENQUETE_ENCERRADA",
    usuarioId,
    dados: { fechaEmDe: enquete.fechaEm.toISOString(), fechaEmPara: agora.toISOString() },
  });
}

export type ResultadoDoRegistro = { nome: string; gravadas: number; apagadas: number; foraDoPrazo: boolean };

/** Registra as respostas em nome da pessoa: grava `registrado_por` e um `registro_acao` por evento que mudou. */
export async function registrarDisponibilidade(
  repo: RepositorioEnquete,
  {
    enqueteId,
    pessoaId,
    respostas,
    usuarioId,
    agora,
  }: { enqueteId: string; pessoaId: string; respostas: { eventoId: string; resposta: Resposta }[]; usuarioId: string; agora: Date },
): Promise<ResultadoDoRegistro> {
  const enquete = await repo.travarEnquete(enqueteId);
  if (!enquete) throw new EnqueteNaoEncontradaError(enqueteId);
  const staff = await repo.staffAtivo(pessoaId);
  if (!staff) throw new PessoaForaDaEnqueteError(pessoaId);

  const foraDoPrazo = situacaoDaEnquete(enquete.fechaEm, agora) === "ENCERRADA";
  const mudancas = await aplicarRespostas(repo, { enqueteId, eventosDaEnquete: enquete.eventoIds, pessoaId, respostas, usuarioId, agora, foraDoPrazo, propria: false });

  return {
    nome: staff.nome,
    gravadas: mudancas.filter((mudanca) => mudanca.tipo === "GRAVAR").length,
    apagadas: mudancas.filter((mudanca) => mudanca.tipo === "APAGAR").length,
    foraDoPrazo,
  };
}

/** Grava o que mudou e registra cada mudança (ou a conferência sem mudança). Devolve as mudanças aplicadas. */
async function aplicarRespostas(
  repo: RepositorioEnquete,
  {
    enqueteId,
    eventosDaEnquete,
    pessoaId,
    respostas,
    usuarioId,
    agora,
    foraDoPrazo,
    propria,
  }: {
    enqueteId: string;
    eventosDaEnquete: string[];
    pessoaId: string;
    respostas: { eventoId: string; resposta: Resposta }[];
    usuarioId: string;
    agora: Date;
    foraDoPrazo: boolean;
    propria: boolean;
  },
): Promise<MudancaDeResposta[]> {
  const atuais = await repo.respostasDaPessoa(
    pessoaId,
    respostas.map((resposta) => resposta.eventoId),
  );
  const mudancas = planoDoRegistro({ enqueteId, eventosDaEnquete, atuais, pedidas: respostas });

  for (const mudanca of mudancas) {
    if (mudanca.tipo === "GRAVAR") {
      await repo.gravarResposta({ enqueteId, eventoId: mudanca.eventoId, pessoaId, disponivel: mudanca.disponivel, instante: agora, registradoPor: propria ? null : usuarioId });
    } else {
      await repo.apagarResposta(mudanca.eventoId, pessoaId);
    }
    const para = mudanca.tipo === "GRAVAR" ? respostaDe(mudanca.disponivel) : "SEM_RESPOSTA";
    await repo.registrarMudanca({ enqueteId, pessoaId, usuarioId, mudanca, para, foraDoPrazo, ...(propria ? { propria } : {}) });
  }
  if (mudancas.length === 0) await repo.registrarSemMudanca({ enqueteId, pessoaId, usuarioId, ...(propria ? { propria } : {}) });
  return mudancas;
}

export type ResultadoDaResposta = { podem: number; total: number; mudou: boolean };

/**
 * A própria pessoa responde pelo link: só com a enquete aberta. Os eventos marcados viram "pode" e os outros da
 * enquete, "não pode"; `registrado_por` fica nulo.
 */
export async function responderEnquete(
  repo: RepositorioEnquete,
  { enqueteId, pessoaId, eventoIds, usuarioId, agora }: { enqueteId: string; pessoaId: string; eventoIds: string[]; usuarioId: string; agora: Date },
): Promise<ResultadoDaResposta> {
  const enquete = await repo.travarEnquete(enqueteId);
  if (!enquete) throw new EnqueteNaoEncontradaError(enqueteId);
  if (situacaoDaEnquete(enquete.fechaEm, agora) === "ENCERRADA") throw new EnqueteFechadaParaRespostaError(enqueteId);
  if (!(await repo.staffAtivo(pessoaId))) throw new PessoaForaDaEnqueteError(pessoaId);

  const daEnquete = new Set(enquete.eventoIds);
  const fora = eventoIds.filter((eventoId) => !daEnquete.has(eventoId));
  if (fora.length > 0) throw new EventoForaDaEnqueteError(fora);

  const marcados = new Set(eventoIds);
  const respostas = enquete.eventoIds.map((eventoId) => ({ eventoId, resposta: (marcados.has(eventoId) ? "PODE" : "NAO_PODE") as Resposta }));
  const mudancas = await aplicarRespostas(repo, { enqueteId, eventosDaEnquete: enquete.eventoIds, pessoaId, respostas, usuarioId, agora, foraDoPrazo: false, propria: true });
  return { podem: marcados.size, total: enquete.eventoIds.length, mudou: mudancas.length > 0 };
}
