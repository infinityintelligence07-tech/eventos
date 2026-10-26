import { describe, expect, it } from "vitest";

import { planejarVagas, planoVazio } from "../plano-vagas";

const linha = (id: string, funcao: string, quantidade: number, convocacoes = 0) => ({ id, funcao, quantidade, convocacoes });

describe("plano de vagas", () => {
  it("cria tudo na primeira vez", () => {
    const plano = planejarVagas([], {
      vagas: [
        { funcao: "LIDER", quantidade: 12 },
        { funcao: "DJ", quantidade: 1 },
      ],
      pendencias: [],
    });
    expect(plano.inserir).toEqual([
      { funcao: "LIDER", quantidade: 12 },
      { funcao: "DJ", quantidade: 1 },
    ]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.remover).toEqual([]);
  });

  it("sem mudança não faz nada", () => {
    const plano = planejarVagas([linha("a", "DJ", 1)], { vagas: [{ funcao: "DJ", quantidade: 1 }], pendencias: [] });
    expect(planoVazio(plano)).toBe(true);
  });

  it("atualiza quantidade e avisa se ficou abaixo das convocações", () => {
    const plano = planejarVagas([linha("a", "LIDER", 12, 11)], {
      vagas: [{ funcao: "LIDER", quantidade: 10 }],
      pendencias: [],
    });
    expect(plano.atualizar).toEqual([{ id: "a", funcao: "LIDER", quantidade: 10 }]);
    expect(plano.avisos).toEqual([expect.stringContaining("já há 11")]);
  });

  it("remove o que a regra não pede mais, menos se já tiver gente convocada", () => {
    const plano = planejarVagas([linha("a", "DJ", 1), linha("b", "CAMARIM", 1, 1)], {
      vagas: [{ funcao: "DJ", quantidade: 0 }],
      pendencias: [],
    });
    expect(plano.remover).toEqual([{ id: "a", funcao: "DJ" }]);
    expect(plano.avisos).toEqual([expect.stringContaining("CAMARIM")]);
  });

  it("não mexe em função pendente (falta dado para calcular)", () => {
    const plano = planejarVagas([linha("a", "PAI_MAE", 6)], {
      vagas: [],
      pendencias: [{ funcao: "PAI_MAE", variavel: "pessoas_na_fila" }],
    });
    expect(planoVazio(plano)).toBe(true);
  });

  it("linha repetida da regra é removida", () => {
    const plano = planejarVagas([linha("a", "DJ", 1), linha("b", "DJ", 1)], {
      vagas: [{ funcao: "DJ", quantidade: 1 }],
      pendencias: [],
    });
    expect(plano.remover).toEqual([{ id: "b", funcao: "DJ" }]);
  });
});
