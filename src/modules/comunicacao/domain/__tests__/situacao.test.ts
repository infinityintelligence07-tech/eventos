import { describe, expect, it } from "vitest";

import {
  contarSituacoes,
  type EnvioAnterior,
  listarEmPortugues,
  recusaDoEnvio,
  situacaoDaCopy,
} from "../situacao";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const enviada = (dadosHash: string): EnvioAnterior => ({ dadosHash, enviadaEm: new Date("2026-11-05T12:00:00Z"), canal: "COPIADO" });

describe("situacaoDaCopy", () => {
  it.each([
    { pronta: false, ultima: null, esperado: "FALTA_DADO" },
    { pronta: false, ultima: enviada(HASH_A), esperado: "FALTA_DADO" },
    { pronta: true, ultima: null, esperado: "PRONTA" },
    { pronta: true, ultima: enviada(HASH_A), esperado: "ENVIADA" },
    { pronta: true, ultima: enviada(HASH_B), esperado: "DESATUALIZADA" },
  ] as const)("pronta=$pronta, última enviada=$ultima.dadosHash → $esperado", ({ pronta, ultima, esperado }) => {
    expect(situacaoDaCopy({ pronta, dadosHash: HASH_A }, ultima)).toBe(esperado);
  });

  it("conta por situação", () => {
    expect(contarSituacoes(["PRONTA", "PRONTA", "ENVIADA"])).toEqual({ FALTA_DADO: 0, DESATUALIZADA: 0, PRONTA: 2, ENVIADA: 1 });
  });

  it("lista em português", () => {
    expect(listarEmPortugues([])).toBe("");
    expect(listarEmPortugues(["voo de ida"])).toBe("voo de ida");
    expect(listarEmPortugues(["voo de ida", "hotel", "sexo da pessoa"])).toBe("voo de ida, hotel e sexo da pessoa");
  });
});

describe("recusaDoEnvio", () => {
  const base = {
    escalaComunicavel: true,
    convocacaoAtiva: true,
    modeloAtivo: true,
    copy: { pronta: true, dadosHash: HASH_A },
    ultimaEnviada: null,
    dadosHashDaTela: HASH_A,
  };

  it("libera a copy pronta e igual à da tela", () => {
    expect(recusaDoEnvio(base)).toBeNull();
  });

  it("libera o reenvio da copy desatualizada", () => {
    expect(recusaDoEnvio({ ...base, ultimaEnviada: enviada(HASH_B) })).toBeNull();
  });

  it.each([
    [{ escalaComunicavel: false }, "ESCALA_NAO_APROVADA"],
    [{ convocacaoAtiva: false }, "CONVOCACAO_INATIVA"],
    [{ modeloAtivo: false }, "MODELO_INATIVO"],
    [{ copy: { pronta: false, dadosHash: HASH_A } }, "FALTA_DADO"],
    [{ dadosHashDaTela: HASH_B }, "COPY_MUDOU"],
    [{ ultimaEnviada: enviada(HASH_A) }, "JA_ENVIADA"],
  ] as const)("%o → %s", (mudanca, esperado) => {
    expect(recusaDoEnvio({ ...base, ...mudanca })).toBe(esperado);
  });
});
