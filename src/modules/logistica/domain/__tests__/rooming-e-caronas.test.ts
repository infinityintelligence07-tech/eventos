import { describe, expect, it } from "vitest";

import { lugaresLivres, podeEntrarNaCarona } from "../caronas";
import { misturaSexos, podeOcupar, type QuartoDoRooming, sugerirRooming } from "../rooming";
import { centavosDoTexto, registrarPedidoDeVooSchema, registrarRetornoDeVooSchema } from "../schemas";

const quarto = (id: string, capacidade: number, sexo: "F" | "M" | null, ocupantes: ("F" | "M" | null)[] = []): QuartoDoRooming => ({
  id,
  capacidade,
  sexo,
  ocupantes: ocupantes.map((sexoDoOcupante, indice) => ({ convocacaoId: `${id}-${indice}`, sexo: sexoDoOcupante })),
});

describe("podeOcupar", () => {
  it.each<[string, QuartoDoRooming, "F" | "M" | null, ReturnType<typeof podeOcupar>]>([
    ["vaga no quarto do mesmo sexo", quarto("q", 2, "F", ["F"]), "F", { ok: true }],
    ["quarto cheio", quarto("q", 2, "F", ["F", "F"]), "F", { ok: false, motivo: "QUARTO_CHEIO" }],
    ["sexo diferente", quarto("q", 2, "F"), "M", { ok: false, motivo: "SEXO_DIFERENTE" }],
    ["sem sexo no cadastro em quarto separado", quarto("q", 2, "M"), null, { ok: false, motivo: "SEM_SEXO_NO_CADASTRO" }],
    ["misto aceita qualquer um", quarto("q", 3, null, ["F"]), "M", { ok: true }],
    ["misto aceita sem sexo", quarto("q", 3, null), null, { ok: true }],
  ])("%s", (_caso, alvo, sexo, esperado) => {
    expect(podeOcupar(alvo, { convocacaoId: "nova", sexo })).toEqual(esperado);
  });

  it("quem já está no quarto não ocupa duas camas", () => {
    expect(podeOcupar(quarto("q", 1, "F", ["F"]), { convocacaoId: "q-0", sexo: "F" })).toEqual({ ok: true });
  });

  it("mistura de sexos ignora quem está sem sexo", () => {
    expect(misturaSexos([{ sexo: "F" }, { sexo: null }])).toBe(false);
    expect(misturaSexos([{ sexo: "F" }, { sexo: "M" }])).toBe(true);
  });
});

describe("sugerirRooming por sexo", () => {
  it("prefere o quarto do mesmo sexo mais cheio, depois misto compatível, depois misto vazio", () => {
    const quartos = [quarto("f1", 2, "F"), quarto("f2", 2, "F", ["F"]), quarto("m1", 2, "M"), quarto("x1", 3, null, ["M"]), quarto("x2", 2, null)];
    const resultado = sugerirRooming(
      [
        { convocacaoId: "ana", sexo: "F" },
        { convocacaoId: "bia", sexo: "F" },
        { convocacaoId: "caio", sexo: "M" },
        { convocacaoId: "sem", sexo: null },
      ],
      quartos,
    );
    expect(resultado.alocacoes).toEqual([
      { convocacaoId: "ana", quartoId: "f2" },
      { convocacaoId: "bia", quartoId: "f1" },
      { convocacaoId: "caio", quartoId: "m1" },
      { convocacaoId: "sem", quartoId: "x2" },
    ]);
    expect(resultado.semLugar).toEqual([]);
  });

  it("quem não cabe fica de fora, sem misturar sexos em quarto separado", () => {
    const resultado = sugerirRooming(
      [
        { convocacaoId: "ana", sexo: "F" },
        { convocacaoId: "caio", sexo: "M" },
      ],
      [quarto("f1", 1, "F"), quarto("x1", 2, null, ["F"])],
    );
    expect(resultado).toEqual({ alocacoes: [{ convocacaoId: "ana", quartoId: "f1" }], semLugar: ["caio"] });
  });
});

describe("caronas", () => {
  it("lugares livres e carro cheio", () => {
    expect(lugaresLivres(4, 1)).toBe(3);
    expect(lugaresLivres(2, 3)).toBe(0);
    const carona = { lugares: 2, passageiros: ["c1", "c2"], motoristaPessoaId: "m" };
    expect(podeEntrarNaCarona(carona, { pessoaId: "p3", convocacaoId: "c3" })).toEqual({ ok: false, motivo: "CARRO_CHEIO" });
    expect(podeEntrarNaCarona(carona, { pessoaId: "p1", convocacaoId: "c1" })).toEqual({ ok: true });
    expect(podeEntrarNaCarona({ ...carona, passageiros: [] }, { pessoaId: "m", convocacaoId: "cm" })).toEqual({
      ok: false,
      motivo: "MOTORISTA_NAO_PODE_SER_PASSAGEIRO",
    });
  });
});

describe("schemas da logística", () => {
  it.each<[string, number | null]>([
    ["980", 98000],
    ["980,5", 98050],
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["12.5", 1250],
    ["0,07", 7],
    ["abc", null],
    ["1,234", null],
    ["-5", null],
  ])("centavosDoTexto(%s) = %s", (texto, esperado) => {
    expect(centavosDoTexto(texto)).toBe(esperado);
  });

  const convocacaoId = "7e570000-0000-7000-8000-000000000002";
  const ida = { sentido: "IDA", origemIata: "poa", destinoIata: "MAO", dataDesejada: "2026-11-05" };

  it("pedido de voo: IATA em maiúsculas, sem sentido repetido, volta depois da ida", () => {
    expect(registrarPedidoDeVooSchema.parse({ convocacaoId, trechos: [ida] }).trechos[0]?.origemIata).toBe("POA");
    expect(registrarPedidoDeVooSchema.safeParse({ convocacaoId, trechos: [ida, ida] }).success).toBe(false);
    expect(
      registrarPedidoDeVooSchema.safeParse({
        convocacaoId,
        trechos: [ida, { sentido: "VOLTA", origemIata: "MAO", destinoIata: "POA", dataDesejada: "2026-11-04" }],
      }).success,
    ).toBe(false);
    expect(registrarPedidoDeVooSchema.safeParse({ convocacaoId, trechos: [{ ...ida, destinoIata: "POA" }] }).success).toBe(false);
  });

  it("retorno da SDC: valor em centavos, código do voo e chegada depois da partida", () => {
    const trecho = { sentido: "IDA", companhia: "Azul", numeroVoo: "ad 4120", localizador: "kxq7pz", partidaEm: "2026-11-05T08:10", chegadaEm: "2026-11-05T11:45" };
    const lido = registrarRetornoDeVooSchema.parse({ pedidoId: convocacaoId, valorCentavos: "980,00", trechos: [trecho] });
    expect(lido.valorCentavos).toBe(98000);
    expect(lido.trechos[0]).toMatchObject({ numeroVoo: "AD4120", localizador: "KXQ7PZ" });
    expect(registrarRetornoDeVooSchema.safeParse({ pedidoId: convocacaoId, valorCentavos: "1", trechos: [{ ...trecho, chegadaEm: "2026-11-05T07:00" }] }).success).toBe(false);
    expect(registrarRetornoDeVooSchema.safeParse({ pedidoId: convocacaoId, valorCentavos: "1", trechos: [{ ...trecho, cartaoEmbarqueUrl: "http://x" }] }).success).toBe(false);
  });
});
