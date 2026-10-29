import { describe, expect, it } from "vitest";

import { modelosCopyDaMigration } from "@/test/seeds";

import { type ContextoDaCopy, dadosDaCopy, descreverTrecho, rotuloDoDeslocamento } from "../contexto-da-copy";
import { gerarCopy } from "../copy";

const modelos = modelosCopyDaMigration();
const escalacaoComGenero = modelos.ESCALACAO!.replace("ESCALADO(A)", "{{genero:ESCALADO|ESCALADA}}");
const tarde = new Date("2026-11-05T17:00:00Z");

const contexto: ContextoDaCopy = {
  evento: {
    codigo: "ASM_AM_235",
    tipoNome: "Imersão Prosperar",
    dataInicio: "2026-12-12",
    dataFim: "2026-12-14",
    local: { nome: "Centro de Convenções", cidade: "Manaus" },
  },
  pessoa: { nome: "MARIA DA SILVA", sexo: "F", funcao: "Staff", deslocamento: "VOO", horaInicio: "07:30" },
  hospedagem: {
    hotel: "Hotel Central",
    logradouro: "Av. Brasil",
    numero: "100",
    bairro: "Centro",
    cidade: "Manaus",
    uf: "AM",
    capacidadeDoQuarto: 2,
    colegas: ["ANA PAULA"],
  },
  voos: {
    ida: { companhia: "AZUL", numeroVoo: "AD4120", localizador: "KXQ7PZ", origemIata: "GRU", destinoIata: "MAO", partidaEm: new Date("2026-12-11T11:10:00Z") },
    volta: null,
  },
  linkCustos: "https://exemplo.test/custos",
};

describe("dadosDaCopy", () => {
  it("preenche a copy de escalação com gênero e link de custos", () => {
    const copy = gerarCopy(escalacaoComGenero, dadosDaCopy(contexto, tarde));
    expect(copy.pronta).toBe(true);
    expect(copy.texto).toContain("você está ESCALADA");
    expect(copy.texto).toContain("📍 Manaus");
    expect(copy.texto).toContain("📅 12 a 14 de dezembro");
    expect(copy.texto).toContain("🕐 7h30");
    expect(copy.texto).toContain("👉 https://exemplo.test/custos");
  });

  it("preenche a copy de hospedagem", () => {
    const copy = gerarCopy(modelos.HOSPEDAGEM!, dadosDaCopy(contexto, tarde));
    expect(copy.pronta).toBe(true);
    expect(copy.texto).toContain("Boa tarde! Tudo bem?");
    expect(copy.texto).toContain("🚗 Deslocamento: Voo");
    expect(copy.texto).toContain("📍 Endereço: Av. Brasil, 100 - Centro - Manaus/AM");
    expect(copy.texto).toContain("🛏️ Colega de quarto: Ana");
  });

  it("sem sexo, sem link e sem hospedagem: a copy fica bloqueada e diz o que falta", () => {
    const incompleto: ContextoDaCopy = {
      ...contexto,
      pessoa: { ...contexto.pessoa, sexo: null, horaInicio: null },
      hospedagem: null,
      linkCustos: null,
    };
    expect(gerarCopy(escalacaoComGenero, dadosDaCopy(incompleto, tarde)).faltando).toEqual(["evento.horario", "link_custos", "pessoa.sexo"]);
    expect(gerarCopy(modelos.HOSPEDAGEM!, dadosDaCopy(incompleto, tarde)).faltando).toEqual([
      "evento.horario",
      "hospedagem.colega",
      "hospedagem.endereco",
      "hospedagem.hotel",
    ]);
  });

  it("colega de quarto: vários nomes, quarto individual e quarto ainda sem ninguém", () => {
    const comColegas = (capacidadeDoQuarto: number, colegas: string[]) =>
      dadosDaCopy({ ...contexto, hospedagem: { ...contexto.hospedagem!, capacidadeDoQuarto, colegas } }, tarde).hospedagem;
    expect(comColegas(3, ["ana paula", "BIA SOUZA"])).toMatchObject({ colega: "Ana e Bia" });
    expect(comColegas(4, ["ana", "bia", "carla"])).toMatchObject({ colega: "Ana, Bia e Carla" });
    expect(comColegas(1, [])).toMatchObject({ colega: "Quarto individual" });
    expect(comColegas(2, [])).toMatchObject({ colega: null });
  });

  it("voo: só entra emitido (com número e horário)", () => {
    expect(descreverTrecho(contexto.voos.ida)).toBe("AD4120 (AZUL) · 11/12 às 08:10 · GRU → MAO · localizador KXQ7PZ");
    expect(descreverTrecho({ ...contexto.voos.ida!, numeroVoo: null })).toBeNull();
    expect(descreverTrecho({ ...contexto.voos.ida!, partidaEm: null })).toBeNull();
    expect(descreverTrecho(null)).toBeNull();
    const faltando = gerarCopy("{{voo.ida}} / {{voo.volta}}", dadosDaCopy(contexto, tarde)).faltando;
    expect(faltando).toEqual(["voo.volta"]);
  });

  it("o hash muda quando muda o voo e não muda com a hora do dia", () => {
    const modelo = "{{saudacao}} {{voo.ida}}";
    const antes = gerarCopy(modelo, dadosDaCopy(contexto, tarde)).dadosHash;
    expect(gerarCopy(modelo, dadosDaCopy(contexto, new Date("2026-11-05T23:00:00Z"))).dadosHash).toBe(antes);
    const outroVoo = { ...contexto, voos: { ...contexto.voos, ida: { ...contexto.voos.ida!, numeroVoo: "AD4999" } } };
    expect(gerarCopy(modelo, dadosDaCopy(outroVoo, tarde)).dadosHash).not.toBe(antes);
  });

  it("rótulos de deslocamento", () => {
    expect(rotuloDoDeslocamento("CARRO_PROPRIO")).toBe("Carro próprio");
    expect(rotuloDoDeslocamento("ONIBUS")).toBe("Ônibus");
  });
});
