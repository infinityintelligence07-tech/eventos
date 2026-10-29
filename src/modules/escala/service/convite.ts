import {
  ConvocacaoInativaError,
  ConvocacaoNaoEncontradaError,
  type EquipeDaComunicacao,
  EscalaMudouError,
  EventoNaoEncontradoError,
  type StatusConvocacao,
  type StatusEscala,
  transicaoDaComunicacao,
  transicaoDoConvite,
} from "../domain/convite";

// Contrato §7.2 (docs/07): usado pela Comunicação na mesma transação em que marca a copy como enviada.

/** Tudo roda no executor recebido (a transação do fluxo). As leituras travam a linha (FOR UPDATE). */
export type RepositorioConvite = {
  travarConvocacao(convocacaoId: string): Promise<StatusConvocacao | null>;
  /** Compare-and-set SUGERIDA → CONVIDADA com convidada_em. false = o status já não era SUGERIDA. */
  marcarConvidada(convocacaoId: string, instante: Date): Promise<boolean>;
  travarComunicacaoDoEvento(eventoId: string): Promise<{ statusEscala: StatusEscala; equipe: EquipeDaComunicacao } | null>;
  /** Compare-and-set APROVADA → COMUNICADA e registro_acao. false = a escala já não estava APROVADA. */
  marcarComunicada(eventoId: string, registro: { usuarioId: string; instante: Date; equipe: EquipeDaComunicacao }): Promise<boolean>;
};

export async function registrarConvite(
  repo: RepositorioConvite,
  { convocacaoId, instante }: { convocacaoId: string; instante: Date },
): Promise<"CONVIDADA" | "SEM_MUDANCA"> {
  const status = await repo.travarConvocacao(convocacaoId);
  if (status === null) throw new ConvocacaoNaoEncontradaError(convocacaoId);

  const transicao = transicaoDoConvite(status);
  if ("erro" in transicao) throw new ConvocacaoInativaError(status);
  if ("semMudanca" in transicao) return "SEM_MUDANCA";

  if (!(await repo.marcarConvidada(convocacaoId, instante))) throw new EscalaMudouError("a convocação mudou antes do convite");
  return "CONVIDADA";
}

export async function concluirComunicacao(
  repo: RepositorioConvite,
  { eventoId, usuarioId, instante }: { eventoId: string; usuarioId: string; instante: Date },
): Promise<"COMUNICADA" | "SEM_MUDANCA"> {
  const situacao = await repo.travarComunicacaoDoEvento(eventoId);
  if (!situacao) throw new EventoNaoEncontradoError(eventoId);

  const transicao = transicaoDaComunicacao(situacao.statusEscala, situacao.equipe);
  if ("semMudanca" in transicao) return "SEM_MUDANCA";

  if (!(await repo.marcarComunicada(eventoId, { usuarioId, instante, equipe: situacao.equipe }))) {
    throw new EscalaMudouError("a escala mudou antes de concluir a comunicação");
  }
  return "COMUNICADA";
}
