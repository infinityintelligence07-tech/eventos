import { describe, expect, it } from "vitest";

import { ordenarOrigens, type OrigemDoHotel, podeTirarOrigem, precisaManterComoAvulsa, rotuloDaOrigemDoHotel } from "../hotel";
import { definirHotelDoVooSchema, hospedeDoEventoSchema, registrarPedidoDeVooSchema } from "../schemas";

describe("quem precisa de hotel: três origens, sem depender da escala", () => {
  it("rótulos e ordem fixa (escala, voo, acrescentada), sem repetir", () => {
    expect((["ESCALA", "VOO", "AVULSA"] as const).map(rotuloDaOrigemDoHotel)).toEqual(["da escala", "do pedido de voo", "acrescentada aqui"]);
    expect(ordenarOrigens(["AVULSA", "ESCALA", "AVULSA", "VOO"])).toEqual(["ESCALA", "VOO", "AVULSA"]);
    expect(ordenarOrigens([])).toEqual([]);
  });

  it.each<[string, OrigemDoHotel[], boolean, OrigemDoHotel, ReturnType<typeof podeTirarOrigem>]>([
    ["única origem, fora de quarto: sai da lista", ["ESCALA"], false, "ESCALA", { ok: true }],
    ["única origem, num quarto: tire do quarto antes", ["ESCALA"], true, "ESCALA", { ok: false, motivo: "NO_QUARTO" }],
    ["voo como única origem, num quarto: recusado", ["VOO"], true, "VOO", { ok: false, motivo: "NO_QUARTO" }],
    ["acrescentada como única origem, num quarto: recusado", ["AVULSA"], true, "AVULSA", { ok: false, motivo: "NO_QUARTO" }],
    ["escala + voo, num quarto: desmarcar na escala não arranca do quarto", ["ESCALA", "VOO"], true, "ESCALA", { ok: true }],
    ["escala + acrescentada, num quarto: tirar o acréscimo mantém pela escala", ["ESCALA", "AVULSA"], true, "AVULSA", { ok: true }],
    ["voo + acrescentada, num quarto: desmarcar o voo mantém pelo acréscimo", ["VOO", "AVULSA"], true, "VOO", { ok: true }],
    ["origem que a pessoa não tem", ["ESCALA"], false, "AVULSA", { ok: false, motivo: "NAO_TEM" }],
    ["fora da lista", [], true, "ESCALA", { ok: false, motivo: "NAO_TEM" }],
  ])("tirar uma origem à mão — %s", (_caso, origens, noQuarto, tirar, esperado) => {
    expect(podeTirarOrigem({ origens, noQuarto }, tirar)).toEqual(esperado);
  });

  it("origem que some por consequência (saiu da escala, voo cancelado): quem está num quarto sem origem fica como acrescentada", () => {
    expect(precisaManterComoAvulsa({ origens: [], noQuarto: true })).toBe(true);
    expect(precisaManterComoAvulsa({ origens: [], noQuarto: false })).toBe(false);
    expect(precisaManterComoAvulsa({ origens: ["VOO"], noQuarto: true })).toBe(false);
    expect(precisaManterComoAvulsa({ origens: ["AVULSA"], noQuarto: true })).toBe(false);
  });

  it("formulários: a caixa do voo marcada vira verdadeiro, desmarcada não vem; o acréscimo é evento + pessoa", () => {
    const id = "7e570000-0000-7000-8000-000000000002";
    const pedido = { eventoId: id, pessoaId: id, trechos: [{ sentido: "IDA", origemIata: "POA", destinoIata: "MAO", dataDesejada: "2026-11-05" }] };
    expect(registrarPedidoDeVooSchema.parse({ ...pedido, precisaHotel: "on" }).precisaHotel).toBe(true);
    expect(registrarPedidoDeVooSchema.parse(pedido).precisaHotel).toBeUndefined();
    expect(definirHotelDoVooSchema.parse({ pedidoId: id, precisaHotel: "false" })).toEqual({ pedidoId: id, precisaHotel: false });
    expect(definirHotelDoVooSchema.safeParse({ pedidoId: id }).success).toBe(false);
    expect(hospedeDoEventoSchema.parse({ eventoId: id, pessoaId: id })).toEqual({ eventoId: id, pessoaId: id });
    expect(hospedeDoEventoSchema.safeParse({ eventoId: id }).success).toBe(false);
  });
});
