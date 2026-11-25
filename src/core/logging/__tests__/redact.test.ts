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

  it("tira o link do WhatsApp, que leva o telefone da pessoa no endereço", () => {
    const limpo = redactSensitive({ protocolo: "STF-202612-0007", mensagemDeAprovado: { linkDoWhatsApp: "https://wa.me/5511999990000?text=Ol%C3%A1", semTelefone: false } });
    expect(limpo).toEqual({ protocolo: "STF-202612-0007", mensagemDeAprovado: { semTelefone: false } });
  });
});
