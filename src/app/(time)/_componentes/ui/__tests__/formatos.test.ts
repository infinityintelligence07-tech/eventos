import { describe, expect, it } from "vitest";

import { caminhoDoCampo, idDoCampo } from "../classes";
import { consumo, dataCompleta, dataCurta, dataEHora, dinheiro, distancia, horario, nomeCurtoDoEvento, periodo, quantidadeDe } from "../formatos";

describe("formatos da doc 08", () => {
  it("datas no fuso de São Paulo", () => {
    expect(dataCurta("2026-11-12")).toBe("12/11");
    expect(dataCompleta("2026-11-12")).toBe("12/11/2026");
    expect(dataEHora(new Date("2026-11-12T17:30:00Z"))).toBe("12/11 às 14:30");
    expect(dataEHora(new Date("2026-11-13T02:05:00Z"))).toBe("12/11 às 23:05");
    expect(dataCurta(new Date("2026-11-13T02:05:00Z"))).toBe("12/11");
    expect(periodo("2026-11-12", "2026-11-14")).toBe("12/11 a 14/11");
    expect(periodo("2026-11-12", "2026-11-12")).toBe("12/11");
    expect(horario("08:00:00", "18:00:00")).toBe("08:00–18:00");
  });

  it("dinheiro em centavos, distância, consumo e quantidade", () => {
    expect(dinheiro(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(distancia(123.44)).toBe("123,4 km");
    expect(consumo(10.5)).toBe("10,5 km/l");
    expect(quantidadeDe(18, 22, "vagas")).toBe("18 de 22 vagas");
  });

  it("nome curto do evento igual em todas as telas", () => {
    expect(nomeCurtoDoEvento({ tipoSigla: "ASM", tipoNome: "ASM", edicao: "235", nome: "ASM · ed. 235 · Americana" })).toBe("ASM 235");
    expect(nomeCurtoDoEvento({ tipoSigla: "CONF", tipoNome: "Confronto", edicao: null, nome: "Confronto" })).toBe("Confronto");
    expect(nomeCurtoDoEvento({ tipoSigla: "MC", tipoNome: "Masterclass", edicao: "3", nome: "Masterclass · ITATIBA" })).toBe("Masterclass · ITATIBA");
    expect(nomeCurtoDoEvento({ tipoSigla: null, tipoNome: null, edicao: null, nome: "Evento antigo" })).toBe("Evento antigo");
  });

  it("id e caminho do campo batem entre o formulário e o Zod", () => {
    expect(caminhoDoCampo("linhas[0].quantidade")).toBe("linhas.0.quantidade");
    expect(caminhoDoCampo("eventoIds[]")).toBe("eventoIds");
    expect(idDoCampo("linhas[0].quantidade")).toBe(idDoCampo("linhas.0.quantidade"));
    expect(idDoCampo("expectativaPublico")).toBe("campo-expectativaPublico");
  });
});
