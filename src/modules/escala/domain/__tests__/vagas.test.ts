import { describe, expect, it } from "vitest";

import { regrasVagasDaMigration } from "@/test/seeds";

import { calcularVagas, compilarRegraVagas, RegraVagasInvalidaError, totalDeVagas } from "../vagas";

const regras = regrasVagasDaMigration();

describe("vagas pelos tipos cadastrados no banco", () => {
  it("lê as regras da migration", () => {
    expect(Object.keys(regras)).toEqual(expect.arrayContaining(["ASM", "CONF", "IPR", "MC"]));
    for (const [sigla, regra] of Object.entries(regras)) {
      expect(() => compilarRegraVagas(regra), sigla).not.toThrow();
    }
  });

  it("Confronto: líderes = público ÷ 25 e pai/mãe = fila ÷ 15, arredondando para cima", () => {
    const resultado = calcularVagas(regras.CONF, { expectativa_publico: 310, pessoas_na_fila: 95 });
    expect(resultado.pendencias).toEqual([]);
    expect(resultado.vagas).toEqual([
      { funcao: "LIDER", quantidade: 13 },
      { funcao: "PAI_MAE", quantidade: 7 },
      { funcao: "DJ", quantidade: 1 },
      { funcao: "SOCIAL_MEDIA", quantidade: 1 },
      { funcao: "FOTOGRAFO", quantidade: 1 },
      { funcao: "CAMARIM", quantidade: 1 },
    ]);
    expect(totalDeVagas(resultado)).toBe(24);
  });

  it("ASM: staff líder = metade do público ÷ 25; staff = 2 por líder", () => {
    const { vagas } = calcularVagas(regras.ASM, { expectativa_publico: 420 });
    expect(vagas.slice(0, 2)).toEqual([
      { funcao: "STAFF_LIDER", quantidade: 9 },
      { funcao: "STAFF", quantidade: 18 },
    ]);
  });

  it("sem pessoas na fila, pai/mãe fica pendente em vez de virar 0", () => {
    const resultado = calcularVagas(regras.CONF, { expectativa_publico: 200, pessoas_na_fila: null });
    expect(resultado.pendencias).toEqual([{ funcao: "PAI_MAE", variavel: "pessoas_na_fila" }]);
    expect(resultado.vagas.map((vaga) => vaga.funcao)).not.toContain("PAI_MAE");
    expect(resultado.vagas[0]).toEqual({ funcao: "LIDER", quantidade: 8 });
  });

  it("pendência se propaga para quem depende da função pendente", () => {
    const resultado = calcularVagas(regras.ASM, {});
    expect(resultado.pendencias).toEqual([
      { funcao: "STAFF_LIDER", variavel: "expectativa_publico" },
      { funcao: "STAFF", variavel: "expectativa_publico" },
    ]);
    expect(totalDeVagas(resultado)).toBe(4);
  });

  it("tipo sem regra não gera vaga", () => {
    expect(calcularVagas(regras.IPR, { expectativa_publico: 100 })).toEqual({ vagas: [], pendencias: [] });
    expect(calcularVagas(null, {})).toEqual({ vagas: [], pendencias: [] });
  });
});

describe("validação da regra (tela de configurações)", () => {
  const erros = (regra: unknown): string[] => {
    try {
      compilarRegraVagas(regra);
      return [];
    } catch (cause) {
      if (cause instanceof RegraVagasInvalidaError) return cause.erros;
      throw cause;
    }
  };

  it("recusa referência a função que vem depois", () => {
    expect(
      erros({ funcoes: [{ funcao: "STAFF", formula: "2 * STAFF_LIDER" }, { funcao: "STAFF_LIDER", fixo: 1 }] }),
    ).toEqual([expect.stringContaining("STAFF_LIDER")]);
  });

  it("recusa função repetida, fórmula quebrada, campo desconhecido e quantidade negativa", () => {
    expect(erros({ funcoes: [{ funcao: "DJ", fixo: 1 }, { funcao: "DJ", fixo: 2 }] })).toHaveLength(1);
    expect(erros({ funcoes: [{ funcao: "DJ", formula: "ceil(" }] })).toHaveLength(1);
    expect(erros({ funcoes: [{ funcao: "DJ", fixo: 1, extra: true }] })).toHaveLength(1);
    expect(erros({ funcoes: [{ funcao: "DJ", fixo: -1 }] })).toHaveLength(1);
    expect(erros({ funcoes: [{ funcao: "dj", fixo: 1 }] })).toHaveLength(1);
  });

  it("resultado negativo vira 0 e fração sobe", () => {
    expect(
      calcularVagas({ funcoes: [{ funcao: "AB", formula: "expectativa_publico - 10" }] }, { expectativa_publico: 3 })
        .vagas,
    ).toEqual([{ funcao: "AB", quantidade: 0 }]);
    expect(
      calcularVagas({ funcoes: [{ funcao: "AB", formula: "expectativa_publico / 4" }] }, { expectativa_publico: 9 })
        .vagas,
    ).toEqual([{ funcao: "AB", quantidade: 3 }]);
  });
});

describe("função digitada em cada evento (Staff do Confronto)", () => {
  const confrontoComStaff = {
    funcoes: [
      { funcao: "LIDER", formula: "ceil(expectativa_publico / 25)" },
      { funcao: "STAFF", digitado: true },
      { funcao: "APOIO", formula: "2 * STAFF" },
      { funcao: "DJ", fixo: 1 },
    ],
  };

  it("não gera número: entra como pendência de digitar, e quem depende dela também fica pendente", () => {
    expect(calcularVagas(confrontoComStaff, { expectativa_publico: 180 })).toEqual({
      vagas: [
        { funcao: "LIDER", quantidade: 8 },
        { funcao: "DJ", quantidade: 1 },
      ],
      pendencias: [
        { funcao: "STAFF", digitar: true },
        { funcao: "APOIO", variavel: "STAFF" },
      ],
    });
  });

  it("aceita só digitado: true, sem número junto", () => {
    expect(() => compilarRegraVagas({ funcoes: [{ funcao: "STAFF", digitado: false }] })).toThrow(RegraVagasInvalidaError);
    expect(() => compilarRegraVagas({ funcoes: [{ funcao: "STAFF", digitado: true, fixo: 3 }] })).toThrow(RegraVagasInvalidaError);
  });
});
