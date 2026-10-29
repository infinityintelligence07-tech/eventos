import { describe, expect, it } from "vitest";

import type { StatusConvocacao } from "../convite";
import { type AcaoDaConvocacao, rotuloDaConvocacao, transicaoDaConvocacao, type TransicaoDaConvocacao } from "../convocacao";

const ATUAIS: (StatusConvocacao | null)[] = [null, "SUGERIDA", "CONVIDADA", "ACEITA", "RECUSADA", "CANCELADA"];
const INVALIDA: TransicaoDaConvocacao = { erro: "TRANSICAO_INVALIDA" };

const ESPERADO: Record<AcaoDaConvocacao, (TransicaoDaConvocacao | null)[]> = {
  //                  null                  SUGERIDA              CONVIDADA             ACEITA                RECUSADA              CANCELADA
  POR_NA_VAGA: [{ para: "SUGERIDA" }, null, null, null, { para: "SUGERIDA" }, { para: "SUGERIDA" }],
  TIRAR_DA_VAGA: [null, { apagar: true }, { para: "CANCELADA" }, { para: "CANCELADA" }, null, null],
  REGISTRAR_ACEITA: [null, null, { para: "ACEITA" }, null, { para: "ACEITA" }, null],
  REGISTRAR_RECUSADA: [null, null, { para: "RECUSADA" }, { para: "RECUSADA" }, null, null],
};

describe("máquina de estado da convocação (docs/07 §4.2)", () => {
  const casos = (Object.keys(ESPERADO) as AcaoDaConvocacao[]).flatMap((acao) =>
    ATUAIS.map((de, indice) => ({ acao, de, esperado: ESPERADO[acao][indice] ?? INVALIDA })),
  );

  it.each(casos)("$acao a partir de $de", ({ acao, de, esperado }) => {
    expect(transicaoDaConvocacao(de, acao)).toEqual(esperado);
  });

  it("rótulos da doc 08 §13", () => {
    expect(rotuloDaConvocacao("ACEITA")).toBe("Confirmou");
    expect(rotuloDaConvocacao("RECUSADA")).toBe("Não pode");
    expect(rotuloDaConvocacao("CONVIDADA")).toBe("Aguardando resposta");
  });
});
