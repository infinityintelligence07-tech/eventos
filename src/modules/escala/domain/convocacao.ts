import type { StatusConvocacao } from "./convite";

// Máquina de estado de convocacao.status (docs/07 §4.2). O convite (SUGERIDA → CONVIDADA) fica em convite.ts.

export type AcaoDaConvocacao = "POR_NA_VAGA" | "TIRAR_DA_VAGA" | "REGISTRAR_ACEITA" | "REGISTRAR_RECUSADA";

export type TransicaoDaConvocacao =
  /** `null` em `de` = a pessoa ainda não tem linha nesta vaga (insere). */
  | { para: StatusConvocacao }
  /** Nunca foi avisada: a linha some. */
  | { apagar: true }
  | { erro: "TRANSICAO_INVALIDA" };

export function transicaoDaConvocacao(atual: StatusConvocacao | null, acao: AcaoDaConvocacao): TransicaoDaConvocacao {
  const invalida: TransicaoDaConvocacao = { erro: "TRANSICAO_INVALIDA" };
  switch (acao) {
    case "POR_NA_VAGA":
      // Pôr de volta reaproveita a linha (UNIQUE escala_id + pessoa_id).
      return atual === null || atual === "CANCELADA" || atual === "RECUSADA" ? { para: "SUGERIDA" } : invalida;
    case "TIRAR_DA_VAGA":
      if (atual === "SUGERIDA") return { apagar: true };
      return atual === "CONVIDADA" || atual === "ACEITA" ? { para: "CANCELADA" } : invalida;
    case "REGISTRAR_ACEITA":
      return atual === "CONVIDADA" || atual === "RECUSADA" ? { para: "ACEITA" } : invalida;
    case "REGISTRAR_RECUSADA":
      return atual === "CONVIDADA" || atual === "ACEITA" ? { para: "RECUSADA" } : invalida;
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação de convocação desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Rótulos da doc 08 §13 (Confirmou / Não pode / Aguardando resposta). */
export function rotuloDaConvocacao(status: StatusConvocacao): string {
  switch (status) {
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
      const desconhecido: never = status;
      throw new Error(`status de convocação desconhecido: ${String(desconhecido)}`);
    }
  }
}
