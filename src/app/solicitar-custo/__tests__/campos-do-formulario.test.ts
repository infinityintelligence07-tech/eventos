import { describe, expect, it } from "vitest";

import { lerFormulario } from "@/app/(time)/_servidor/formulario";
import { corrigirMeuCustoSchema, solicitarCustoSchema } from "@/modules/custos";

// O contrato entre os nomes dos campos de _componentes/formulario.tsx e o schema que a server action lê.

const eventoId = "0192f0c0-0000-7000-8000-000000000001";

function formulario(campos: [string, string][]): FormData {
  const form = new FormData();
  for (const [nome, valor] of campos) form.append(nome, valor);
  return form;
}

describe("campos do formulário de custo do staff", () => {
  it("deslocamento de carro com ida e volta e uma despesa", () => {
    const lido = lerFormulario(
      formulario([
        ["eventoId", eventoId],
        ["foiDeCarro", "on"],
        ["deslocamentos[0].origem", "Canoas"],
        ["deslocamentos[0].destino", "Porto Alegre"],
        ["deslocamentos[0].km", "20,5"],
        ["deslocamentos[0].consumoKmL", "11"],
        ["deslocamentos[0].precoLitroCentavos", "6,19"],
        ["deslocamentos[0].pedagioCentavos", ""],
        ["deslocamentos[0].idaVolta", "on"],
        ["despesas[0].descricao", "Estacionamento"],
        ["despesas[0].valorCentavos", "25,00"],
      ]),
      solicitarCustoSchema,
    );
    expect(lido).toEqual({
      ok: true,
      dados: {
        eventoId,
        deslocamentos: [{ origem: "Canoas", destino: "Porto Alegre", idaVolta: true, km: 20.5, consumoKmL: 11, precoLitroCentavos: 619, pedagioCentavos: 0 }],
        despesas: [{ descricao: "Estacionamento", valorCentavos: 2500 }],
      },
    });
  });

  it("sem carro: só a despesa; a caixa 'ida e volta' desmarcada não chega e vira só ida", () => {
    const semCarro = lerFormulario(formulario([["eventoId", eventoId], ["foiDeCarro", "on"], ["despesas[0].descricao", "Ônibus"], ["despesas[0].valorCentavos", "80"]]), solicitarCustoSchema);
    expect(semCarro).toMatchObject({ ok: true, dados: { deslocamentos: [], despesas: [{ descricao: "Ônibus", valorCentavos: 8000 }] } });

    const soIda = lerFormulario(
      formulario([
        ["eventoId", eventoId],
        ["deslocamentos[0].origem", "Canoas"],
        ["deslocamentos[0].destino", "Porto Alegre"],
        ["deslocamentos[0].km", "20"],
        ["deslocamentos[0].consumoKmL", "11"],
        ["deslocamentos[0].precoLitroCentavos", "6"],
      ]),
      solicitarCustoSchema,
    );
    expect(soIda).toMatchObject({ ok: true, dados: { deslocamentos: [{ idaVolta: false }] } });
  });

  it("erros voltam por campo, no caminho que o formulário mostra", () => {
    const lido = lerFormulario(
      formulario([
        ["eventoId", eventoId],
        ["deslocamentos[0].origem", "Canoas"],
        ["deslocamentos[0].km", "vinte"],
        ["deslocamentos[0].consumoKmL", "0"],
        ["deslocamentos[0].precoLitroCentavos", "6,19"],
        ["despesas[0].descricao", "Estacionamento"],
      ]),
      solicitarCustoSchema,
    );
    expect(lido.ok).toBe(false);
    expect(Object.keys((lido as { campos?: Record<string, string[]> }).campos ?? {}).sort()).toEqual([
      "deslocamentos.0.consumoKmL",
      "deslocamentos.0.destino",
      "deslocamentos.0.km",
      "despesas.0.valorCentavos",
    ]);
  });

  it("formulário sem linhas passa (pode levar só os itens fixos; o serviço recusa o vazio); a correção exige a versão", () => {
    expect(lerFormulario(formulario([["eventoId", eventoId], ["foiDeCarro", "on"]]), solicitarCustoSchema)).toEqual({ ok: true, dados: { eventoId, deslocamentos: [], despesas: [] } });
    const campos: [string, string][] = [["eventoId", eventoId], ["despesas[0].descricao", "Ônibus"], ["despesas[0].valorCentavos", "80"]];
    expect(lerFormulario(formulario(campos), corrigirMeuCustoSchema).ok).toBe(false);
    expect(lerFormulario(formulario([...campos, ["atualizadoEm", "2026-12-20T15:00:00.000Z"]]), corrigirMeuCustoSchema).ok).toBe(true);
  });
});
