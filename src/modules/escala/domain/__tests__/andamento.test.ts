import { describe, expect, it } from "vitest";

import { andamentoDoEvento, proximoPasso } from "../andamento";
import type { StatusEscala } from "../convite";
import { type LinhaDaMontagem, resumoDaMontagem } from "../montagem";

const REGRA = { funcoes: [{ funcao: "LIDER", formula: "ceil(expectativa_publico / 25)" }, { funcao: "PAI_MAE", formula: "ceil(pessoas_na_fila / 15)" }] };
const linha = (funcao: string, quantidade: number, confirmada: boolean, ativas: number): LinhaDaMontagem => ({
  id: funcao,
  funcao,
  nomeDaFuncao: funcao,
  data: "2026-11-12",
  quantidade,
  origem: "REGRA",
  confirmada,
  ativas,
});

describe("andamento do evento", () => {
  it("Confronto sem fila: vagas com pendência, escala começada, aprovação não enviada", () => {
    const resumo = resumoDaMontagem(REGRA, { expectativa_publico: 100 }, [linha("LIDER", 4, true, 2)], (codigo) => codigo);
    const etapas = andamentoDoEvento("RASCUNHO", resumo, null);
    expect(etapas.map((etapa) => [etapa.chave, etapa.situacao])).toEqual([
      ["vagas", "PENDENCIA"],
      ["escala", "EM_ANDAMENTO"],
      ["aprovacao", "NAO_COMECOU"],
      ["comunicacao", "NAO_COMECOU"],
      ["logistica", "NAO_COMECOU"],
      ["custos", "NAO_COMECOU"],
    ]);
    expect(etapas[1]!.detalhe).toBe("2 de 4 vagas");
  });

  it("aprovada e completa", () => {
    const resumo = resumoDaMontagem(REGRA, { expectativa_publico: 100, pessoas_na_fila: 30 }, [linha("LIDER", 4, true, 4), linha("PAI_MAE", 2, true, 2)], (c) => c);
    const etapas = andamentoDoEvento("APROVADA", resumo, "05/11");
    expect(etapas.slice(0, 4).map((etapa) => etapa.situacao)).toEqual(["FEITA", "FEITA", "FEITA", "EM_ANDAMENTO"]);
    expect(etapas[2]!.detalhe).toBe("Aprovada em 05/11");
  });

  it.each<[StatusEscala, string]>([
    ["SEM_ESCALA", "Montar escala"],
    ["RASCUNHO", "Continuar escala"],
    ["DEVOLVIDA", "Continuar escala"],
    ["AGUARDANDO_APROVACAO", "Ver aprovação"],
    ["APROVADA", "Ir para Comunicação"],
    ["COMUNICADA", "Ver escala"],
  ])("próximo passo em %s: %s", (status, rotulo) => {
    expect(proximoPasso(status).rotulo).toBe(rotulo);
  });
});
