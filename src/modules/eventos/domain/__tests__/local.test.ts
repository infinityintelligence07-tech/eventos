import { describe, expect, it } from "vitest";

import { motivoParaNaoArquivar, rotuloDoTipoDeLocal, salvarLocalSchema } from "../local";

const base = { nome: " Hotel Central ", tipo: "HOTEL", cidade: "Manaus", uf: "am" };

describe("salvarLocalSchema", () => {
  it("normaliza o que veio do formulário", () => {
    expect(salvarLocalSchema.parse({ ...base, cep: "69005010", lat: "-3,119", lng: "-60.0217", capacidade: "120", logradouro: "  " })).toEqual({
      nome: "Hotel Central",
      tipo: "HOTEL",
      cep: "69005-010",
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: "Manaus",
      uf: "AM",
      lat: -3.119,
      lng: -60.0217,
      capacidade: 120,
    });
  });

  it("sem coordenadas e sem capacidade fica nulo", () => {
    expect(salvarLocalSchema.parse(base)).toMatchObject({ lat: null, lng: null, capacidade: null, cep: null });
  });

  it.each([
    [{ tipo: "ESCRITORIO" }, "tipo"],
    [{ uf: "Amazonas" }, "uf"],
    [{ cep: "123" }, "cep"],
    [{ lat: "-91", lng: "0" }, "lat"],
    [{ lat: "-3.1" }, "lng"],
    [{ capacidade: "0" }, "capacidade"],
    [{ nome: " " }, "nome"],
  ])("recusa %o no campo %s", (mudanca, campo) => {
    const lido = salvarLocalSchema.safeParse({ ...base, ...mudanca });
    expect(lido.success).toBe(false);
    expect(lido.error?.issues.map((issue) => issue.path.join("."))).toContain(campo);
  });
});

describe("arquivar", () => {
  it("explica por que um local em uso não sai da lista", () => {
    expect(motivoParaNaoArquivar({ eventos: 0, hospedagens: 0 })).toBeNull();
    expect(motivoParaNaoArquivar({ eventos: 3, hospedagens: 0 })).toBe("Este local está em 3 eventos.");
    expect(motivoParaNaoArquivar({ eventos: 1, hospedagens: 1 })).toBe("Este local está em 1 evento e 1 hospedagem.");
  });

  it("rótulos dos tipos", () => {
    expect(rotuloDoTipoDeLocal("EVENTO")).toBe("Local de evento");
    expect(rotuloDoTipoDeLocal("APARTAMENTO")).toBe("Apartamento");
  });
});
