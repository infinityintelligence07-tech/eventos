import { describe, expect, it } from "vitest";

import { corrigirMeuCustoSchema, solicitarCustoSchema } from "../schemas";

const eventoId = "0192f0c0-0000-7000-8000-000000000001";
const deslocamento = { origem: "Canoas", destino: "Porto Alegre", idaVolta: "on", km: "20,5", consumoKmL: "11", precoLitroCentavos: "6,19", pedagioCentavos: "4,50" };

describe("formulário de custo do staff", () => {
  it("lê o deslocamento com a validação do registro do time e a despesa em reais", () => {
    const lido = solicitarCustoSchema.parse({ eventoId, deslocamentos: [deslocamento], despesas: [{ descricao: " Estacionamento ", valorCentavos: "25,00" }] });
    expect(lido.deslocamentos[0]).toEqual({ origem: "Canoas", destino: "Porto Alegre", idaVolta: true, km: 20.5, consumoKmL: 11, precoLitroCentavos: 619, pedagioCentavos: 450 });
    expect(lido.despesas).toEqual([{ descricao: "Estacionamento", valorCentavos: 2500 }]);
  });

  it("não aceita pessoa, categoria nem quantidade vindas do formulário", () => {
    const lido = solicitarCustoSchema.parse({ eventoId, pessoaId: eventoId, despesas: [{ descricao: "Ônibus", valorCentavos: "80", categoria: "REMUNERACAO", quantidade: "10" }] });
    expect(lido).toEqual({ eventoId, deslocamentos: [], despesas: [{ descricao: "Ônibus", valorCentavos: 8000 }] });
  });

  it("sem deslocamento e sem despesa é válido aqui: a solicitação pode levar só os itens fixos (quem recusa o vazio é o serviço)", () => {
    expect(solicitarCustoSchema.parse({ eventoId })).toEqual({ eventoId, deslocamentos: [], despesas: [] });
    expect(solicitarCustoSchema.safeParse({ eventoId, deslocamentos: Array.from({ length: 11 }, () => deslocamento) }).success).toBe(false);
  });

  it("consumo zero e despesa sem descrição são recusados", () => {
    expect(solicitarCustoSchema.safeParse({ eventoId, deslocamentos: [{ ...deslocamento, consumoKmL: "0" }] }).success).toBe(false);
    expect(solicitarCustoSchema.safeParse({ eventoId, despesas: [{ descricao: "  ", valorCentavos: "10" }] }).success).toBe(false);
  });

  it("a correção leva a versão da solicitação", () => {
    expect(corrigirMeuCustoSchema.safeParse({ eventoId, despesas: [{ descricao: "Ônibus", valorCentavos: "80" }] }).success).toBe(false);
    expect(corrigirMeuCustoSchema.safeParse({ eventoId, atualizadoEm: "2026-12-20T15:00:00.000Z", despesas: [{ descricao: "Ônibus", valorCentavos: "80" }] }).success).toBe(true);
  });
});
