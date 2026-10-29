import { describe, expect, it } from "vitest";

import { type ModeloDeCopy, modeloEmUso, trocaDeTipoRecusada } from "../modelo";

const modelo = (id: string, tipo: ModeloDeCopy["tipo"], ativo: boolean, atualizadoEm: string): ModeloDeCopy => ({
  id,
  tipo,
  nome: id,
  corpo: "Oi",
  ativo,
  atualizadoEm: new Date(atualizadoEm),
});

describe("modeloEmUso", () => {
  it("escolhe o ativo do tipo alterado por último", () => {
    const modelos = [
      modelo("antigo", "ESCALACAO", true, "2026-10-01T00:00:00Z"),
      modelo("novo", "ESCALACAO", true, "2026-10-20T00:00:00Z"),
      modelo("inativo", "ESCALACAO", false, "2026-10-30T00:00:00Z"),
      modelo("hotel", "HOSPEDAGEM", true, "2026-10-31T00:00:00Z"),
    ];
    expect(modeloEmUso(modelos, "ESCALACAO")?.id).toBe("novo");
    expect(modeloEmUso(modelos, "LEMBRETE")).toBeNull();
  });
});

describe("trocaDeTipoRecusada", () => {
  it("só recusa trocar o tipo de um modelo ativo", () => {
    expect(trocaDeTipoRecusada({ tipo: "ESCALACAO", ativo: true }, "HOSPEDAGEM")).toBe(true);
    expect(trocaDeTipoRecusada({ tipo: "ESCALACAO", ativo: true }, "ESCALACAO")).toBe(false);
    expect(trocaDeTipoRecusada({ tipo: "ESCALACAO", ativo: false }, "HOSPEDAGEM")).toBe(false);
  });
});
