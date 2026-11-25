import { describe, expect, it } from "vitest";

import {
  aprovacaoValeParaACompra,
  type CompraDoPedido,
  MENSAGEM_COMPRA_MUDOU,
  efeitoNaAprovacao,
  podeAprovarPagamento,
  podeDesfazerAprovacao,
  rotuloDoPagamento,
  type SituacaoDoPagamento,
  situacaoDoPagamento,
  totaisDoPagamento,
} from "../pagamento";
import type { SituacaoDoPedido } from "../pedido";
import { aprovarPagamentoSchema } from "../schemas";

const APROVADO_EM = new Date("2026-12-20T15:00:00Z");
const compra = (situacao: SituacaoDoPedido, valorCentavos: number | null, aprovadoEm: Date | null = null): CompraDoPedido => ({ situacao, valorCentavos, aprovadoEm });

describe("pagamento das compras da SDC: time solicita, SDC registra o valor, time aprova depois", () => {
  it.each<[string, CompraDoPedido, SituacaoDoPagamento]>([
    ["pedido ainda não comprado", compra("PEDIDO", null), "SEM_COMPRA"],
    ["compra registrada com valor", compra("EMITIDO", 98000), "A_APROVAR"],
    ["compra de valor zero também espera aprovação", compra("EMITIDO", 0), "A_APROVAR"],
    ["emitido sem valor não é compra completa", compra("EMITIDO", null), "SEM_COMPRA"],
    ["aprovado", compra("EMITIDO", 98000, APROVADO_EM), "APROVADO"],
    ["alterado pelo time: o valor antigo não vale mais", compra("ALTERADO", 98000), "SEM_COMPRA"],
    ["cancelado", compra("CANCELADO", 98000), "CANCELADO"],
    ["cancelado nunca aparece como aprovado", compra("CANCELADO", 98000, APROVADO_EM), "CANCELADO"],
  ])("%s", (_caso, pedido, esperado) => {
    expect(situacaoDoPagamento(pedido)).toBe(esperado);
  });

  it("só se aprova compra registrada e com valor; cancelado e já aprovado não", () => {
    expect(podeAprovarPagamento(compra("EMITIDO", 98000))).toEqual({ ok: true });
    expect(podeAprovarPagamento(compra("PEDIDO", null))).toEqual({ ok: false, motivo: "SEM_COMPRA" });
    expect(podeAprovarPagamento(compra("EMITIDO", null))).toEqual({ ok: false, motivo: "SEM_COMPRA" });
    expect(podeAprovarPagamento(compra("ALTERADO", 98000))).toEqual({ ok: false, motivo: "SEM_COMPRA" });
    expect(podeAprovarPagamento(compra("CANCELADO", 98000))).toEqual({ ok: false, motivo: "CANCELADO" });
    expect(podeAprovarPagamento(compra("EMITIDO", 98000, APROVADO_EM))).toEqual({ ok: false, motivo: "JA_APROVADO" });
  });

  it("só o que está aprovado se desfaz", () => {
    expect(podeDesfazerAprovacao(compra("EMITIDO", 98000, APROVADO_EM))).toBe(true);
    expect(podeDesfazerAprovacao(compra("EMITIDO", 98000))).toBe(false);
    expect(podeDesfazerAprovacao(compra("CANCELADO", 98000, APROVADO_EM))).toBe(false);
  });

  it("mexer na compra: sem aprovação segue; aprovado, a SDC não mexe e, com o time, a aprovação cai", () => {
    for (const quem of ["TIME", "SDC"] as const) {
      expect(efeitoNaAprovacao(compra("PEDIDO", null), quem)).toEqual({ permitido: true, aprovacaoCai: false });
      expect(efeitoNaAprovacao(compra("EMITIDO", 98000), quem)).toEqual({ permitido: true, aprovacaoCai: false });
      expect(efeitoNaAprovacao(compra("ALTERADO", 98000), quem)).toEqual({ permitido: true, aprovacaoCai: false });
    }
    expect(efeitoNaAprovacao(compra("EMITIDO", 98000, APROVADO_EM), "SDC")).toEqual({ permitido: false });
    expect(efeitoNaAprovacao(compra("EMITIDO", 98000, APROVADO_EM), "TIME")).toEqual({ permitido: true, aprovacaoCai: true });
  });

  it("totais como a planilha soma: a aprovar e aprovado, sem contar o que não tem compra nem o cancelado", () => {
    expect(
      totaisDoPagamento([
        compra("EMITIDO", 98000),
        compra("EMITIDO", 12050),
        compra("EMITIDO", 240000, APROVADO_EM),
        compra("PEDIDO", null),
        compra("ALTERADO", 50000),
        compra("CANCELADO", 70000, APROVADO_EM),
      ]),
    ).toEqual({ aAprovar: 2, aAprovarCentavos: 110050, aprovados: 1, aprovadoCentavos: 240000 });
    expect(totaisDoPagamento([])).toEqual({ aAprovar: 0, aAprovarCentavos: 0, aprovados: 0, aprovadoCentavos: 0 });
  });

  it("rótulos e o formulário de aprovação (a confirmação é obrigatória)", () => {
    expect((["SEM_COMPRA", "A_APROVAR", "APROVADO", "CANCELADO"] as const).map(rotuloDoPagamento)).toEqual(["Sem compra registrada", "A aprovar", "Aprovado para pagamento", "Cancelado"]);
    const pedidoId = "018f4e2a-0000-7000-8000-000000000001";
    const visto = { valorCentavos: "98000", atualizadoEm: "2026-12-20T15:00:00.000Z" };
    expect(aprovarPagamentoSchema.parse({ pedidoId, confirmo: "on", observacao: " usamos ", ...visto })).toEqual({
      pedidoId,
      confirmo: true,
      observacao: "usamos",
      valorCentavos: 98000,
      atualizadoEm: "2026-12-20T15:00:00.000Z",
    });
    expect(aprovarPagamentoSchema.safeParse({ pedidoId, ...visto }).success).toBe(false);
    expect(aprovarPagamentoSchema.safeParse({ pedidoId, confirmo: "false", ...visto }).success).toBe(false);
    // Sem o valor e a versão que a tela mostrou, não há o que aprovar.
    expect(aprovarPagamentoSchema.safeParse({ pedidoId, confirmo: "on" }).success).toBe(false);
    expect(aprovarPagamentoSchema.safeParse({ pedidoId, confirmo: "on", ...visto, valorCentavos: "980,00" }).success).toBe(false);
    expect(aprovarPagamentoSchema.safeParse({ pedidoId, confirmo: "on", ...visto, valorCentavos: "-1" }).success).toBe(false);
    expect(aprovarPagamentoSchema.safeParse({ pedidoId, confirmo: "on", ...visto, atualizadoEm: "ontem" }).success).toBe(false);
  });

  it("a aprovação vale só para a compra que o aprovador viu: mesmo valor e mesma versão", () => {
    const pedido = { valorCentavos: 98000, atualizadoEm: new Date("2026-12-20T15:00:00.123Z") };
    expect(aprovacaoValeParaACompra(pedido, { valorCentavos: 98000, atualizadoEm: "2026-12-20T15:00:00.123Z" })).toBe(true);
    expect(aprovacaoValeParaACompra(pedido, { valorCentavos: 98001, atualizadoEm: "2026-12-20T15:00:00.123Z" })).toBe(false);
    expect(aprovacaoValeParaACompra(pedido, { valorCentavos: 98000, atualizadoEm: "2026-12-20T15:00:00.122Z" })).toBe(false);
    expect(aprovacaoValeParaACompra(pedido, { valorCentavos: 98000, atualizadoEm: "não é data" })).toBe(false);
    expect(aprovacaoValeParaACompra({ ...pedido, valorCentavos: null }, { valorCentavos: 0, atualizadoEm: "2026-12-20T15:00:00.123Z" })).toBe(false);
    expect(MENSAGEM_COMPRA_MUDOU).toBe("A compra mudou depois que você abriu a tela. Confira de novo.");
  });
});
