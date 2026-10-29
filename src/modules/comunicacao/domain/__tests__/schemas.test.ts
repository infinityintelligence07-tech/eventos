import { describe, expect, it } from "vitest";

import { marcarCopyComoEnviadaSchema, salvarLinkDeCustosSchema, salvarModeloSchema } from "../schemas";

const ID = "7e570000-0000-7000-8000-000000000001";

describe("marcarCopyComoEnviadaSchema", () => {
  it("aceita ids e hash de 64 caracteres hexadecimais", () => {
    expect(marcarCopyComoEnviadaSchema.safeParse({ convocacaoId: ID, modeloId: ID, dadosHash: "f".repeat(64) }).success).toBe(true);
  });

  it("recusa hash fora do formato", () => {
    expect(marcarCopyComoEnviadaSchema.safeParse({ convocacaoId: ID, modeloId: ID, dadosHash: "xyz" }).success).toBe(false);
  });
});

describe("salvarModeloSchema", () => {
  it("aceita modelo válido", () => {
    const lido = salvarModeloSchema.safeParse({ tipo: "ESCALACAO", nome: " Escalação ", corpo: "Você está {{genero:ESCALADO|ESCALADA}}" });
    expect(lido.success && lido.data.nome).toBe("Escalação");
  });

  it("recusa campo inexistente com a mensagem da tela", () => {
    const lido = salvarModeloSchema.safeParse({ tipo: "ESCALACAO", nome: "Escalação", corpo: "Oi {{pessoa.apelido}}" });
    expect(lido.success).toBe(false);
    expect(lido.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["corpo", "O campo {{pessoa.apelido}} não existe. Use os botões de Inserir campo."],
    ]);
  });

  it("recusa tipo fora do CHECK e texto vazio", () => {
    expect(salvarModeloSchema.safeParse({ tipo: "OUTRO", nome: "Escalação", corpo: "Oi" }).success).toBe(false);
    expect(salvarModeloSchema.safeParse({ tipo: "ESCALACAO", nome: "Escalação", corpo: "   " }).success).toBe(false);
  });
});

describe("salvarLinkDeCustosSchema", () => {
  it("aceita https e vazio (apaga)", () => {
    expect(salvarLinkDeCustosSchema.safeParse({ linkCustos: "https://exemplo.test/custos" }).success).toBe(true);
    expect(salvarLinkDeCustosSchema.parse({})).toEqual({});
  });

  it("recusa http e texto que não é endereço", () => {
    expect(salvarLinkDeCustosSchema.safeParse({ linkCustos: "http://exemplo.test" }).success).toBe(false);
    expect(salvarLinkDeCustosSchema.safeParse({ linkCustos: "formulário" }).success).toBe(false);
  });
});
