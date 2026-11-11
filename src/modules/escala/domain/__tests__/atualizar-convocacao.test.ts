import { describe, expect, it } from "vitest";

import { atualizarConvocacaoSchema, DESLOCAMENTOS, LIMITE_DA_OBSERVACAO, mudancaDaConvocacao } from "../schemas";

const ids = { eventoId: "018f4e2a-0000-7000-8000-000000000001", convocacaoId: "018f4e2a-0000-7000-8000-000000000002" };
const mudanca = (campos: Record<string, unknown>) => mudancaDaConvocacao(atualizarConvocacaoSchema.parse({ ...ids, ...campos }));

describe("atualizar convocação: um campo por envio", () => {
  it("aceita moto e a pé (planilha BD 2026)", () => {
    expect(DESLOCAMENTOS).toContain("MOTO");
    expect(DESLOCAMENTOS).toContain("A_PE");
    expect(mudanca({ campo: "deslocamento", deslocamento: "A_PE" })).toEqual({ campo: "deslocamento", deslocamento: "A_PE" });
  });

  it("sem o campo, vale deslocamento; sem valor, fica não definido", () => {
    expect(mudanca({ deslocamento: "MOTO" })).toEqual({ campo: "deslocamento", deslocamento: "MOTO" });
    expect(mudanca({ campo: "deslocamento" })).toEqual({ campo: "deslocamento", deslocamento: null });
  });

  it("montagem é caixa de seleção: marcada chega 'sim', desmarcada não chega", () => {
    expect(mudanca({ campo: "montagem", montagem: "sim" })).toEqual({ campo: "montagem", montagem: true });
    expect(mudanca({ campo: "montagem" })).toEqual({ campo: "montagem", montagem: false });
  });

  it("observação: apara, apaga quando vazia e respeita o limite", () => {
    expect(mudanca({ campo: "observacao", observacao: "  meio período  " })).toEqual({ campo: "observacao", observacao: "meio período" });
    expect(mudanca({ campo: "observacao" })).toEqual({ campo: "observacao", observacao: null });
    expect(atualizarConvocacaoSchema.safeParse({ ...ids, campo: "observacao", observacao: "x".repeat(LIMITE_DA_OBSERVACAO + 1) }).success).toBe(false);
  });

  it("mudar um campo não carrega os outros, mesmo que venham no formulário", () => {
    expect(mudanca({ campo: "montagem", montagem: "sim", deslocamento: "VOO", observacao: "x" })).toEqual({ campo: "montagem", montagem: true });
  });

  it("recusa campo e deslocamento desconhecidos", () => {
    expect(atualizarConvocacaoSchema.safeParse({ ...ids, campo: "status" }).success).toBe(false);
    expect(atualizarConvocacaoSchema.safeParse({ ...ids, deslocamento: "BICICLETA" }).success).toBe(false);
  });
});
