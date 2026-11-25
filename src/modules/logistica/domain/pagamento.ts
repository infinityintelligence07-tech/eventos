import type { SituacaoDoPedido } from "./pedido";

// Aprovação do pagamento (docs/07 §4.5): o time solicita, a SDC compra e registra o valor, e o time confere e aprova
// para pagamento, confirmando que a passagem ou o hotel foi usado. A aprovação vem DEPOIS da compra e cai sempre que a
// compra muda. Tudo aqui é puro; o serviço aplica com o pedido travado.

/** Como o pedido está para o financeiro. "A aprovar" não é gravado: é o pedido emitido, com valor e sem aprovação. */
export type SituacaoDoPagamento = "SEM_COMPRA" | "A_APROVAR" | "APROVADO" | "CANCELADO";

export type CompraDoPedido = { situacao: SituacaoDoPedido; valorCentavos: number | null; aprovadoEm: Date | string | null };

export function situacaoDoPagamento(pedido: CompraDoPedido): SituacaoDoPagamento {
  if (pedido.situacao === "CANCELADO") return "CANCELADO";
  // PEDIDO ainda não foi comprado; ALTERADO espera a SDC registrar a compra nova (o valor antigo não vale mais).
  if (pedido.situacao !== "EMITIDO" || pedido.valorCentavos === null) return "SEM_COMPRA";
  return pedido.aprovadoEm ? "APROVADO" : "A_APROVAR";
}

export function rotuloDoPagamento(situacao: SituacaoDoPagamento): string {
  switch (situacao) {
    case "SEM_COMPRA":
      return "Sem compra registrada";
    case "A_APROVAR":
      return "A aprovar";
    case "APROVADO":
      return "Aprovado para pagamento";
    case "CANCELADO":
      return "Cancelado";
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de pagamento desconhecida: ${String(desconhecida)}`);
    }
  }
}

export type RecusaDaAprovacao = "CANCELADO" | "SEM_COMPRA" | "JA_APROVADO";

/** Só se aprova compra registrada e com valor; cancelado não se aprova; aprovar duas vezes não. */
export function podeAprovarPagamento(pedido: CompraDoPedido): { ok: true } | { ok: false; motivo: RecusaDaAprovacao } {
  const situacao = situacaoDoPagamento(pedido);
  switch (situacao) {
    case "A_APROVAR":
      return { ok: true };
    case "APROVADO":
      return { ok: false, motivo: "JA_APROVADO" };
    case "CANCELADO":
      return { ok: false, motivo: "CANCELADO" };
    case "SEM_COMPRA":
      return { ok: false, motivo: "SEM_COMPRA" };
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de pagamento desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function mensagemDaRecusaDaAprovacao(motivo: RecusaDaAprovacao): string {
  switch (motivo) {
    case "CANCELADO":
      return "Este pedido foi cancelado: não há pagamento a aprovar.";
    case "SEM_COMPRA":
      return "Só dá para aprovar depois que a compra estiver registrada com o valor.";
    case "JA_APROVADO":
      return "Este pagamento já foi aprovado. Recarregue a página.";
    default: {
      const desconhecido: never = motivo;
      throw new Error(`recusa desconhecida: ${String(desconhecido)}`);
    }
  }
}

/** Só o time desfaz, e só o que está aprovado. */
export function podeDesfazerAprovacao(pedido: CompraDoPedido): boolean {
  return situacaoDoPagamento(pedido) === "APROVADO";
}

export type QuemMexeNaCompra = "TIME" | "SDC";

/**
 * Alguém vai mexer na compra de um pedido (registrar ou corrigir o retorno, alterar ou cancelar o pedido). Sem
 * aprovação, segue. Com o pagamento aprovado: a SDC não mexe (o time desfaz a aprovação antes); o time mexe e a
 * aprovação cai, voltando para "a aprovar" quando houver compra de novo.
 */
export function efeitoNaAprovacao(pedido: CompraDoPedido, quem: QuemMexeNaCompra): { permitido: true; aprovacaoCai: boolean } | { permitido: false } {
  if (situacaoDoPagamento(pedido) !== "APROVADO") return { permitido: true, aprovacaoCai: false };
  return quem === "SDC" ? { permitido: false } : { permitido: true, aprovacaoCai: true };
}

export const MENSAGEM_COMPRA_APROVADA = "O pagamento deste pedido já foi aprovado pelo time de eventos. Para corrigir a compra, peça ao time para desfazer a aprovação.";

export type TotaisDoPagamento = { aAprovar: number; aAprovarCentavos: number; aprovados: number; aprovadoCentavos: number };

/** A soma que a planilha faz: quanto está esperando a aprovação do time e quanto já foi aprovado para pagamento. */
export function totaisDoPagamento(pedidos: CompraDoPedido[]): TotaisDoPagamento {
  const totais: TotaisDoPagamento = { aAprovar: 0, aAprovarCentavos: 0, aprovados: 0, aprovadoCentavos: 0 };
  for (const pedido of pedidos) {
    const situacao = situacaoDoPagamento(pedido);
    if (situacao === "A_APROVAR") {
      totais.aAprovar += 1;
      totais.aAprovarCentavos += pedido.valorCentavos ?? 0;
    } else if (situacao === "APROVADO") {
      totais.aprovados += 1;
      totais.aprovadoCentavos += pedido.valorCentavos ?? 0;
    }
  }
  return totais;
}
