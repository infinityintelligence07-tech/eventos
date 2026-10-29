import { describe, expect, it } from "vitest";

import { salvarDadosDoEventoSchema } from "../schemas";
import { dadosEditados, usaFila } from "../resumo";

const ID = "7e570000-0000-7000-8000-000000000001";

describe("público e fila do evento", () => {
  it.each([
    ["CONF", true],
    ["ASM", false],
    [null, false],
  ] as const)("%s usa fila: %s", (sigla, esperado) => {
    expect(usaFila(sigla)).toBe(esperado);
  });

  it("fora do Confronto a fila não muda", () => {
    expect(dadosEditados("ASM", { pessoasNaFila: 12 }, { expectativaPublico: 300, pessoasNaFila: 90 })).toEqual({ expectativaPublico: 300, pessoasNaFila: 12 });
    expect(dadosEditados("CONF", { pessoasNaFila: 12 }, { expectativaPublico: 300, pessoasNaFila: null })).toEqual({ expectativaPublico: 300, pessoasNaFila: null });
  });

  it.each([
    [{ eventoId: ID, expectativaPublico: "180", pessoasNaFila: "", atualizadoEm: "2026-10-28T12:00:00.123456Z" }, true],
    [{ eventoId: ID, atualizadoEm: "2026-10-28T12:00:00Z" }, true],
    [{ eventoId: ID, expectativaPublico: "-1", atualizadoEm: "2026-10-28T12:00:00Z" }, false],
    [{ eventoId: ID, expectativaPublico: "1,5", atualizadoEm: "2026-10-28T12:00:00Z" }, false],
    [{ eventoId: ID, expectativaPublico: "10" }, false],
    [{ eventoId: "x", atualizadoEm: "2026-10-28T12:00:00Z" }, false],
  ])("schema %#", (entrada, valido) => {
    expect(salvarDadosDoEventoSchema.safeParse(entrada).success).toBe(valido);
  });

  it("vazio vira nulo", () => {
    const lido = salvarDadosDoEventoSchema.parse({ eventoId: ID, expectativaPublico: "180", atualizadoEm: "2026-10-28T12:00:00Z" });
    expect(lido).toMatchObject({ expectativaPublico: 180, pessoasNaFila: null });
  });
});
