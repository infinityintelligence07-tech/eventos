import { describe, expect, it } from "vitest";

import type { StatusConvocacao } from "../convite";
import { type AcaoDaConvocacao, rotuloDaConvocacao, transicaoDaConvocacao, type TransicaoDaConvocacao } from "../convocacao";

const ATUAIS: (StatusConvocacao | null)[] = [null, "SUGERIDA", "CONVIDADA", "ACEITA", "RECUSADA", "CANCELADA"];
const INVALIDA: TransicaoDaConvocacao = { erro: "TRANSICAO_INVALIDA" };

const ESPERADO: Record<AcaoDaConvocacao, (TransicaoDaConvocacao | null)[]> = {
  //                  null                  SUGERIDA              CONVIDADA             ACEITA                RECUSADA              CANCELADA
  // Quem entra na escala já entra confirmado. ACEITA aqui é sem aviso (o padrão): sai sem deixar linha.
  POR_NA_VAGA: [{ para: "ACEITA" }, null, null, null, { para: "ACEITA" }, { para: "ACEITA" }],
  TIRAR_DA_VAGA: [null, { apagar: true }, { para: "CANCELADA" }, { apagar: true }, null, null],
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

  it("tirar da vaga: confirmada que já foi avisada fica como removida; sem aviso, a linha some", () => {
    expect(transicaoDaConvocacao("ACEITA", "TIRAR_DA_VAGA", { avisada: true })).toEqual({ para: "CANCELADA" });
    expect(transicaoDaConvocacao("ACEITA", "TIRAR_DA_VAGA", { avisada: false })).toEqual({ apagar: true });
    // Dados antigos: SUGERIDA nunca foi avisada e CONVIDADA sempre foi, diga o que disser o parâmetro.
    expect(transicaoDaConvocacao("SUGERIDA", "TIRAR_DA_VAGA", { avisada: true })).toEqual({ apagar: true });
    expect(transicaoDaConvocacao("CONVIDADA", "TIRAR_DA_VAGA", { avisada: false })).toEqual({ para: "CANCELADA" });
    for (const fora of ["RECUSADA", "CANCELADA"] as const) expect(transicaoDaConvocacao(fora, "TIRAR_DA_VAGA", { avisada: true })).toEqual(INVALIDA);
  });

  it("rótulos da doc 08 §13", () => {
    expect(rotuloDaConvocacao("ACEITA")).toBe("Confirmou");
    expect(rotuloDaConvocacao("RECUSADA")).toBe("Não pode");
    expect(rotuloDaConvocacao("CONVIDADA")).toBe("Aguardando resposta");
  });
});
