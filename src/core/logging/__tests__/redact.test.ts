import { describe, expect, it } from "vitest";

import { redactSensitive } from "../redact";

describe("redactSensitive", () => {
  it("tira os dados pessoais da docs/09 §9.1 (inclusive em camelCase e snake_case)", () => {
    const limpo = redactSensitive({
      usuarioId: "u1",
      pessoa: { nome_completo: "Ana", nomeSocial: "Ana", sexo: "F", lat: -3.1, lng: -60, telefone: "11 9", email: "a@x.test" },
      observacao: "texto livre",
      comentario: "devolvida",
      motivo: "viagem",
      dados: { campos: ["sexo"] },
    });
    expect(limpo).toEqual({ usuarioId: "u1", pessoa: {}, dados: { campos: ["sexo"] } });
  });
});
