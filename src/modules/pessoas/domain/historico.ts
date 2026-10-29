// Histórico da pessoa: convocações por evento (doc 08 §9.2 e §13). Lido direto de convocacao (docs/07 §7.4).

/** Valores do CHECK convocacao_status_check. */
export type SituacaoNaEscala = "SUGERIDA" | "CONVIDADA" | "ACEITA" | "RECUSADA" | "CANCELADA";

export function rotuloDaSituacaoNaEscala(situacao: SituacaoNaEscala): string {
  switch (situacao) {
    case "SUGERIDA":
      return "Na escala (não avisada)";
    case "CONVIDADA":
      return "Aguardando resposta";
    case "ACEITA":
      return "Confirmou";
    case "RECUSADA":
      return "Não pode";
    case "CANCELADA":
      return "Removida";
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação na escala desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Trabalhou (ou vai trabalhar) no evento: conta para "Último evento". */
export function contaComoTrabalho(situacao: SituacaoNaEscala): boolean {
  switch (situacao) {
    case "SUGERIDA":
    case "CONVIDADA":
    case "ACEITA":
      return true;
    case "RECUSADA":
    case "CANCELADA":
      return false;
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação na escala desconhecida: ${String(desconhecida)}`);
    }
  }
}

export type ItemDoHistorico = {
  convocacaoId: string;
  eventoId: string;
  eventoCodigo: string | null;
  eventoNome: string;
  dataInicio: string;
  dataFim: string;
  funcao: string | null;
  situacao: SituacaoNaEscala;
  respondidaEm: Date | null;
  /** Preenchido = resposta registrada pelo time em nome da pessoa. */
  registradoPor: string | null;
  presenca: string | null;
};
