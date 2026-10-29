import type { NivelDeExcecao } from "./calculo";

// Auditoria da solicitação de custo (docs/07 §4.4). Dois eixos: auditoria (time de eventos) e financeiro.
// PAGO e REJEITADO são do financeiro: nenhuma tela desta rodada grava esses valores.

/** Valores do CHECK solicitacao_custo_auditoria_check. */
export type StatusAuditoria = "PENDENTE" | "APROVADO" | "REPROVADO";
/** Valores do CHECK solicitacao_custo_financeiro_check. */
export type StatusFinanceiro = "AGUARDANDO_AUDITORIA" | "AGUARDANDO_PAGAMENTO" | "PENDENTE_CADASTRO" | "PAGO" | "REJEITADO";

export type AcaoDeAuditoria = "APROVAR" | "REPROVAR" | "CORRIGIR" | "REABRIR";

export type SituacaoDaSolicitacao = { auditoria: StatusAuditoria; financeiro: StatusFinanceiro };

export type TransicaoDaAuditoria = { para: SituacaoDaSolicitacao } | { erro: "TRANSICAO_INVALIDA" | "JA_NO_FINANCEIRO" };

const INVALIDA: TransicaoDaAuditoria = { erro: "TRANSICAO_INVALIDA" };
const PARA_AUDITAR: SituacaoDaSolicitacao = { auditoria: "PENDENTE", financeiro: "AGUARDANDO_AUDITORIA" };

export function transicaoDaAuditoria(atual: SituacaoDaSolicitacao, acao: AcaoDeAuditoria): TransicaoDaAuditoria {
  switch (acao) {
    case "APROVAR":
      return atual.auditoria === "PENDENTE" ? { para: { auditoria: "APROVADO", financeiro: "AGUARDANDO_PAGAMENTO" } } : INVALIDA;
    case "REPROVAR":
      return atual.auditoria === "PENDENTE" ? { para: { auditoria: "REPROVADO", financeiro: "AGUARDANDO_AUDITORIA" } } : INVALIDA;
    case "CORRIGIR":
      return atual.auditoria === "REPROVADO" ? { para: PARA_AUDITAR } : INVALIDA;
    case "REABRIR":
      if (atual.auditoria !== "APROVADO") return INVALIDA;
      return atual.financeiro === "AGUARDANDO_PAGAMENTO" ? { para: PARA_AUDITAR } : { erro: "JA_NO_FINANCEIRO" };
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação de auditoria desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Decisão provisória do gerente (docs/07 §11.1): motivo obrigatório para reprovar e para aprovar com alerta crítico. */
export function exigeMotivo(acao: "APROVAR" | "REPROVAR", nivel: NivelDeExcecao): boolean {
  switch (acao) {
    case "REPROVAR":
      return true;
    case "APROVAR":
      return nivel === "CRITICO";
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Doc 08 §13. */
export function rotuloDaAuditoria(status: StatusAuditoria): string {
  switch (status) {
    case "PENDENTE":
      return "Para auditar";
    case "APROVADO":
      return "Aprovada";
    case "REPROVADO":
      return "Reprovada";
    default: {
      const desconhecido: never = status;
      throw new Error(`status de auditoria desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Texto do financeiro (sem chip). `pagoEm` em AAAA-MM-DD. */
export function textoDoFinanceiro(status: StatusFinanceiro, pagoEm: string | null): string {
  switch (status) {
    case "AGUARDANDO_AUDITORIA":
      return "Aguardando auditoria";
    case "AGUARDANDO_PAGAMENTO":
      return "Aguardando pagamento";
    case "PENDENTE_CADASTRO":
      return "Cadastro pendente (sem PIX)";
    case "PAGO":
      return pagoEm ? `Pago em ${pagoEm.slice(8, 10)}/${pagoEm.slice(5, 7)}` : "Pago";
    case "REJEITADO":
      return "Rejeitado pelo financeiro";
    default: {
      const desconhecido: never = status;
      throw new Error(`status financeiro desconhecido: ${String(desconhecido)}`);
    }
  }
}

const ORDEM_DO_NIVEL: Record<NivelDeExcecao, number> = { CRITICO: 0, ALERTA: 1, NENHUM: 2 };

/** Fila "Para auditar" (doc 08 §11.1): críticos → alertas → sem alerta; em cada grupo, a mais antiga primeiro. */
export function ordenarParaAuditoria<S extends { nivel: NivelDeExcecao; criadoEm: Date; protocolo: string }>(solicitacoes: S[]): S[] {
  return [...solicitacoes].sort(
    (a, b) => ORDEM_DO_NIVEL[a.nivel] - ORDEM_DO_NIVEL[b.nivel] || a.criadoEm.getTime() - b.criadoEm.getTime() || a.protocolo.localeCompare(b.protocolo),
  );
}

/** Valores do CHECK custo_item_categoria_check. */
export type CategoriaDoItem = "REMUNERACAO" | "ALIMENTACAO" | "ADICIONAL" | "MONTAGEM" | "OUTRO";
export const CATEGORIAS_DO_ITEM: CategoriaDoItem[] = ["REMUNERACAO", "ALIMENTACAO", "ADICIONAL", "MONTAGEM", "OUTRO"];

export function rotuloDaCategoriaDoItem(categoria: CategoriaDoItem): string {
  switch (categoria) {
    case "REMUNERACAO":
      return "Remuneração";
    case "ALIMENTACAO":
      return "Alimentação";
    case "ADICIONAL":
      return "Adicional";
    case "MONTAGEM":
      return "Montagem";
    case "OUTRO":
      return "Outro";
    default: {
      const desconhecida: never = categoria;
      throw new Error(`categoria de item desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function mensagemDaTransicaoInvalida(acao: AcaoDeAuditoria, motivo: "TRANSICAO_INVALIDA" | "JA_NO_FINANCEIRO"): string {
  if (motivo === "JA_NO_FINANCEIRO") return "O financeiro já tratou esta solicitação. Não dá para reabrir a auditoria.";
  switch (acao) {
    case "APROVAR":
    case "REPROVAR":
      return "Esta solicitação já foi auditada. Recarregue a página.";
    case "CORRIGIR":
      return "Só dá para corrigir uma solicitação reprovada.";
    case "REABRIR":
      return "Só dá para reabrir uma solicitação aprovada.";
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação de auditoria desconhecida: ${String(desconhecida)}`);
    }
  }
}
