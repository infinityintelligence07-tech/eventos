import { describe, expect, it } from "vitest";

import { CodigoEventoInvalidoError, montarCodigoEvento, normalizarCodigoEvento, partesDoCodigo } from "../codigo";

describe("código do evento SIGLA_POLO_EDIÇÃO", () => {
  it("monta a partir da turma", () => {
    expect(montarCodigoEvento({ sigla: "asm", polo: "poa", edicao: 234 })).toBe("ASM_POA_234");
    expect(montarCodigoEvento({ sigla: "CONF", polo: "AM", edicao: "060" })).toBe("CONF_AM_60");
    expect(montarCodigoEvento({ sigla: "IMERSAO_NEGOCIOS", polo: "SP", edicao: 3 })).toBe("IMERSAO_NEGOCIOS_SP_3");
  });

  it("recusa partes inválidas", () => {
    expect(() => montarCodigoEvento({ sigla: "ASM", polo: "POA", edicao: 0 })).toThrow(CodigoEventoInvalidoError);
    expect(() => montarCodigoEvento({ sigla: "ASM", polo: "P1", edicao: 1 })).toThrow(CodigoEventoInvalidoError);
    expect(() => montarCodigoEvento({ sigla: "A S", polo: "POA", edicao: 1 })).toThrow(CodigoEventoInvalidoError);
    expect(() => montarCodigoEvento({ sigla: "ASM", polo: "POA", edicao: "2a" })).toThrow(CodigoEventoInvalidoError);
  });

  it("separa as partes mesmo com sigla composta", () => {
    expect(partesDoCodigo("IMERSAO_NEGOCIOS_SP_3")).toEqual({ sigla: "IMERSAO_NEGOCIOS", polo: "SP", edicao: 3 });
    expect(partesDoCodigo("ASM_POA")).toBeNull();
  });

  it("normaliza o que foi digitado nas planilhas", () => {
    expect(normalizarCodigoEvento("asm poa 234")).toBe("ASM_POA_234");
    expect(normalizarCodigoEvento(" ASM-POA-0234 ")).toBe("ASM_POA_234");
    expect(normalizarCodigoEvento("Conf_AM__60")).toBe("CONF_AM_60");
    expect(normalizarCodigoEvento("Confronto AM 60", { aliases: { CONFRONTO: "CONF" } })).toBe("CONF_AM_60");
    expect(normalizarCodigoEvento("Imersão Negócios SP 3")).toBe("IMERSAO_NEGOCIOS_SP_3");
    expect(normalizarCodigoEvento("ASM POA")).toBeNull();
    expect(normalizarCodigoEvento("")).toBeNull();
  });
});
