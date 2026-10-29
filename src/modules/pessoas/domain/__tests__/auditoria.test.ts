import { describe, expect, it } from "vitest";

import { camposAlterados } from "../auditoria";

describe("camposAlterados", () => {
  it.each<[Record<string, unknown> | null, Record<string, unknown>, string[]]>([
    [{ sexo: "F", camisetaTamanho: "M" }, { sexo: "F", camisetaTamanho: "G" }, ["camisetaTamanho"]],
    [{ sexo: null }, { sexo: "M" }, ["sexo"]],
    [{ sexo: "M" }, { sexo: null }, ["sexo"]],
    [{ sexo: "M", temCnpj: true }, { sexo: undefined, temCnpj: true }, []],
    [null, { sexo: "F", fezConfronto: false }, ["sexo", "fezConfronto"]],
    [{ lugares: 4, consumoKmL: "10.5" }, { lugares: 4, consumoKmL: 10.5 }, []],
    [{ lugares: 4 }, { lugares: 5 }, ["lugares"]],
  ])("%o → %o = %o", (antes, depois, esperado) => {
    expect(camposAlterados(antes, depois)).toEqual(esperado);
  });
});
