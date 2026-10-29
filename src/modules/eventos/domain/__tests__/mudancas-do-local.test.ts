import { describe, expect, it } from "vitest";

import { mudancasDoLocal } from "../local";

describe("mudancasDoLocal", () => {
  it("só os campos que mudaram, com de/para; nulo e ausente são iguais", () => {
    expect(mudancasDoLocal({ nome: "Hotel A", numero: null, cidade: "Manaus" }, { nome: "Hotel B", numero: undefined, cidade: "Manaus" })).toEqual({
      nome: { de: "Hotel A", para: "Hotel B" },
    });
    expect(mudancasDoLocal(null, { nome: "Novo", uf: "AM" })).toEqual({ nome: { de: null, para: "Novo" }, uf: { de: null, para: "AM" } });
  });
});
