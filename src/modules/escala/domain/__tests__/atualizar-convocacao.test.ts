import { describe, expect, it } from "vitest";

import { atualizarConvocacaoSchema, DESLOCAMENTOS, mudancaDaConvocacao } from "../schemas";

const ids = { eventoId: "018f4e2a-0000-7000-8000-000000000001", convocacaoId: "018f4e2a-0000-7000-8000-000000000002" };
const mudanca = (campos: Record<string, unknown>) => mudancaDaConvocacao(atualizarConvocacaoSchema.parse({ ...ids, ...campos }));

describe("atualizar convocação: um campo por envio", () => {
  it("deslocamento: carro próprio, carona, carro da IAM, Uber, ônibus e avião; moto, a pé e não se aplica saíram", () => {
    expect([...DESLOCAMENTOS]).toEqual(["CARRO_PROPRIO", "CARONA", "CARRO_IAM", "UBER", "ONIBUS", "VOO"]);
    expect(mudanca({ campo: "deslocamento", deslocamento: "ONIBUS" })).toEqual({ campo: "deslocamento", deslocamento: "ONIBUS" });
    for (const antigo of ["MOTO", "A_PE", "NAO_SE_APLICA"]) {
      expect(atualizarConvocacaoSchema.safeParse({ ...ids, campo: "deslocamento", deslocamento: antigo }).success).toBe(false);
    }
  });

  it("sem o campo, vale deslocamento; sem valor, fica não definido", () => {
    expect(mudanca({ deslocamento: "UBER" })).toEqual({ campo: "deslocamento", deslocamento: "UBER" });
    expect(mudanca({ campo: "deslocamento" })).toEqual({ campo: "deslocamento", deslocamento: null });
  });

  it("montagem é caixa de seleção: marcada chega 'sim', desmarcada não chega", () => {
    expect(mudanca({ campo: "montagem", montagem: "sim" })).toEqual({ campo: "montagem", montagem: true });
    expect(mudanca({ campo: "montagem" })).toEqual({ campo: "montagem", montagem: false });
  });

  it("hotel é caixa de seleção: marcada, a pessoa precisa de hotel; desmarcada, não", () => {
    expect(mudanca({ campo: "hotel", hotel: "sim" })).toEqual({ campo: "hotel", precisaHotel: true });
    expect(mudanca({ campo: "hotel" })).toEqual({ campo: "hotel", precisaHotel: false });
  });

  it("a observação saiu da escala: o campo não é mais aceito", () => {
    expect(atualizarConvocacaoSchema.safeParse({ ...ids, campo: "observacao", observacao: "meio período" }).success).toBe(false);
  });

  it("mudar um campo não carrega os outros, mesmo que venham no formulário", () => {
    expect(mudanca({ campo: "montagem", montagem: "sim", deslocamento: "VOO", hotel: "sim" })).toEqual({ campo: "montagem", montagem: true });
  });

  it("recusa campo e deslocamento desconhecidos", () => {
    expect(atualizarConvocacaoSchema.safeParse({ ...ids, campo: "status" }).success).toBe(false);
    expect(atualizarConvocacaoSchema.safeParse({ ...ids, deslocamento: "BICICLETA" }).success).toBe(false);
  });
});
