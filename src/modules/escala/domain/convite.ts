// Convite e comunicação da escala (docs/07 §4.1, §4.2 e contrato §7.2).
// Marcar a copy de escalação como enviada convida a pessoa (SUGERIDA → CONVIDADA); quando a última pessoa
// ativa recebe a copy, a escala passa de APROVADA para COMUNICADA.

/** Valores do CHECK evento_status_escala_check. */
export type StatusEscala = "SEM_ESCALA" | "RASCUNHO" | "AGUARDANDO_APROVACAO" | "DEVOLVIDA" | "APROVADA" | "COMUNICADA";

/** Valores do CHECK convocacao_status_check. */
export type StatusConvocacao = "SUGERIDA" | "CONVIDADA" | "ACEITA" | "RECUSADA" | "CANCELADA";

/** Ativa ocupa a vaga e precisa receber a copy. */
export function convocacaoAtiva(status: StatusConvocacao): boolean {
  switch (status) {
    case "SUGERIDA":
    case "CONVIDADA":
    case "ACEITA":
      return true;
    case "RECUSADA":
    case "CANCELADA":
      return false;
    default: {
      const desconhecido: never = status;
      throw new Error(`status de convocação desconhecido: ${String(desconhecido)}`);
    }
  }
}

export type TransicaoDoConvite = { para: "CONVIDADA" } | { semMudanca: true } | { erro: "CONVOCACAO_INATIVA" };

export function transicaoDoConvite(status: StatusConvocacao): TransicaoDoConvite {
  switch (status) {
    case "SUGERIDA":
      return { para: "CONVIDADA" };
    case "CONVIDADA":
    case "ACEITA":
      return { semMudanca: true };
    case "RECUSADA":
    case "CANCELADA":
      return { erro: "CONVOCACAO_INATIVA" };
    default: {
      const desconhecido: never = status;
      throw new Error(`status de convocação desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Copys de escalação só saem com a escala aprovada (ou já comunicada, para reenvio). */
export function podeComunicar(statusEscala: StatusEscala): boolean {
  switch (statusEscala) {
    case "APROVADA":
    case "COMUNICADA":
      return true;
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "AGUARDANDO_APROVACAO":
    case "DEVOLVIDA":
      return false;
    default: {
      const desconhecido: never = statusEscala;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

export type EquipeDaComunicacao = {
  /** Convocações ativas do evento. */
  ativas: number;
  /** Ativas sem mensagem ENVIADA de modelo ESCALACAO. */
  semEnvio: number;
};

export type TransicaoDaComunicacao = { para: "COMUNICADA" } | { semMudanca: true };

/** Escala sem ninguém ativo não conta como comunicada. Fora de APROVADA, nada muda (idempotente). */
export function transicaoDaComunicacao(statusEscala: StatusEscala, equipe: EquipeDaComunicacao): TransicaoDaComunicacao {
  switch (statusEscala) {
    case "APROVADA":
      return equipe.ativas > 0 && equipe.semEnvio === 0 ? { para: "COMUNICADA" } : { semMudanca: true };
    case "COMUNICADA":
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "AGUARDANDO_APROVACAO":
    case "DEVOLVIDA":
      return { semMudanca: true };
    default: {
      const desconhecido: never = statusEscala;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

/**
 * A convocação saiu da escala (RECUSADA ou CANCELADA): não dá para convidar.
 * O fluxo traduz para RegraDeNegocioError (src/fluxos/_base) com a mensagem da tela.
 */
export class ConvocacaoInativaError extends Error {
  constructor(readonly status: StatusConvocacao) {
    super(`convocação inativa (${status}) não pode ser convidada`);
    this.name = "ConvocacaoInativaError";
  }
}

/** Convocação inexistente. O fluxo traduz para RegraDeNegocioError ("A pessoa não está mais nesta escala."). */
export class ConvocacaoNaoEncontradaError extends Error {
  constructor(readonly convocacaoId: string) {
    super(`convocação ${convocacaoId} não encontrada`);
    this.name = "ConvocacaoNaoEncontradaError";
  }
}

/** Evento inexistente ou apagado. O fluxo traduz para RegraDeNegocioError ("Evento não encontrado."). */
export class EventoNaoEncontradoError extends Error {
  constructor(readonly eventoId: string) {
    super(`evento ${eventoId} não encontrado`);
    this.name = "EventoNaoEncontradoError";
  }
}

/** O compare-and-set não achou o status esperado. O fluxo traduz para ConflitoDeVersaoError ("recarregue"). */
export class EscalaMudouError extends Error {
  constructor(detalhe: string) {
    super(detalhe);
    this.name = "EscalaMudouError";
  }
}
