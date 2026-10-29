import {
  EnqueteJaEncerradaError,
  EnqueteNaoEncontradaError,
  EventoInexistenteError,
  FechamentoNoPassadoError,
  situacaoDaEnquete,
} from "../domain/enquete";
import {
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
  gravarResposta(dados: { enqueteId: string; eventoId: string; pessoaId: string; disponivel: boolean; instante: Date; registradoPor: string }): Promise<void>;
  apagarResposta(eventoId: string, pessoaId: string): Promise<void>;
  registrarMudanca(dados: {
    enqueteId: string;
    pessoaId: string;
    usuarioId: string;
    mudanca: MudancaDeResposta;
    para: Resposta;
    foraDoPrazo: boolean;
  }): Promise<void>;
  /** O registro pedido não mudou nada: fica a trilha de quem conferiu (toda escrita registra, docs/09 §7.2). */
  registrarSemMudanca(dados: { enqueteId: string; pessoaId: string; usuarioId: string }): Promise<void>;
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

  const atuais = await repo.respostasDaPessoa(
    pessoaId,
    respostas.map((resposta) => resposta.eventoId),
  );
  const mudancas = planoDoRegistro({ enqueteId, eventosDaEnquete: enquete.eventoIds, atuais, pedidas: respostas });
  const foraDoPrazo = situacaoDaEnquete(enquete.fechaEm, agora) === "ENCERRADA";

  for (const mudanca of mudancas) {
    if (mudanca.tipo === "GRAVAR") {
      await repo.gravarResposta({ enqueteId, eventoId: mudanca.eventoId, pessoaId, disponivel: mudanca.disponivel, instante: agora, registradoPor: usuarioId });
    } else {
      await repo.apagarResposta(mudanca.eventoId, pessoaId);
    }
    const para = mudanca.tipo === "GRAVAR" ? respostaDe(mudanca.disponivel) : "SEM_RESPOSTA";
    await repo.registrarMudanca({ enqueteId, pessoaId, usuarioId, mudanca, para, foraDoPrazo });
  }
  if (mudancas.length === 0) await repo.registrarSemMudanca({ enqueteId, pessoaId, usuarioId });

  return {
    nome: staff.nome,
    gravadas: mudancas.filter((mudanca) => mudanca.tipo === "GRAVAR").length,
    apagadas: mudancas.filter((mudanca) => mudanca.tipo === "APAGAR").length,
    foraDoPrazo,
  };
}
