import { describe, expect, it } from "vitest";

import {
  avaliarFormula,
  compilarFormula,
  DivisaoPorZeroError,
  FormulaInvalidaError,
  VariavelAusenteError,
  variaveisDaFormula,
} from "../formula";

const calcular = (formula: string, variaveis: Record<string, number | null> = {}) =>
  avaliarFormula(compilarFormula(formula), variaveis);

describe("fórmula de vagas", () => {
  it("respeita precedência e parênteses", () => {
    expect(calcular("2 + 3 * 4")).toBe(14);
    expect(calcular("(2 + 3) * 4")).toBe(20);
    expect(calcular("10 - 4 - 3")).toBe(3);
    expect(calcular("-2 * -3")).toBe(6);
  });

  it("aplica funções", () => {
    expect(calcular("ceil(301 / 25)")).toBe(13);
    expect(calcular("floor(7.9)")).toBe(7);
    expect(calcular("max(1, 2, 3)")).toBe(3);
    expect(calcular("min(4, ceil(x / 2))", { x: 3 })).toBe(2);
  });

  it("não deixa ruído de ponto flutuante subir o ceil", () => {
    expect(calcular("ceil(0.1 * 3 * 10)")).toBe(3);
    expect(calcular("ceil(expectativa_publico * 0.5 / 25)", { expectativa_publico: 100 })).toBe(2);
  });

  it("lista as variáveis usadas", () => {
    expect([...variaveisDaFormula(compilarFormula("2 * STAFF_LIDER + ceil(a / b)"))].sort()).toEqual([
      "STAFF_LIDER",
      "a",
      "b",
    ]);
  });

  it("recusa sintaxe inválida e funções desconhecidas", () => {
    for (const formula of ["", "2 +", "(1", "1 2", "abs(1)", "ceil()", "ceil(1, 2)", "1; drop", "x.y"]) {
      expect(() => compilarFormula(formula), formula).toThrow(FormulaInvalidaError);
    }
  });

  it("não usa propriedades herdadas como variável", () => {
    expect(() => calcular("constructor")).toThrow(VariavelAusenteError);
    expect(() => calcular("toString + 1")).toThrow(VariavelAusenteError);
  });

  it("acusa variável sem valor e divisão por zero", () => {
    expect(() => calcular("x / 2", { x: null })).toThrow(VariavelAusenteError);
    expect(() => calcular("4 / x", { x: 0 })).toThrow(DivisaoPorZeroError);
  });
});
