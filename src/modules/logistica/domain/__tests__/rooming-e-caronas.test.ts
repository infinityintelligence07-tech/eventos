import { describe, expect, it } from "vitest";

import { lugaresLivres, podeEntrarNaCarona } from "../caronas";
import { misturaSexos, nomeComPeriodo, periodoProprio, podeOcupar, podeTrocar, type QuartoDoRooming, sugerirRooming } from "../rooming";
import { textoDoPedidoDeHospedagem } from "../pedido";
import {
  centavosDoTexto,
  criarHospedagemSchema,
  definirPeriodoDoOcupanteSchema,
  dispensarLogisticaDoEventoSchema,
  FORMA_DE_PAGAMENTO_PADRAO,
  NOVO_HOTEL,
  registrarRetornoDeHospedagemSchema,
  destinoDaTroca,
  destinoNoQuarto,
  moverDeQuartoSchema,
  registrarPedidoDeVooSchema,
  registrarRetornoDeVooSchema,
} from "../schemas";

const quarto = (id: string, capacidade: number, sexo: "F" | "M" | null, ocupantes: ("F" | "M" | null)[] = []): QuartoDoRooming => ({
  id,
  capacidade,
  sexo,
  ocupantes: ocupantes.map((sexoDoOcupante, indice) => ({ pessoaId: `${id}-${indice}`, sexo: sexoDoOcupante })),
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
    expect(podeOcupar(alvo, { pessoaId: "nova", sexo })).toEqual(esperado);
  });

  it("quem já está no quarto não ocupa duas camas", () => {
    expect(podeOcupar(quarto("q", 1, "F", ["F"]), { pessoaId: "q-0", sexo: "F" })).toEqual({ ok: true });
  });

  it("mistura de sexos ignora quem está sem sexo", () => {
    expect(misturaSexos([{ sexo: "F" }, { sexo: null }])).toBe(false);
    expect(misturaSexos([{ sexo: "F" }, { sexo: "M" }])).toBe(true);
  });
});

describe("podeTrocar (duas pessoas trocam de lugar em um passo)", () => {
  const ocupante = (quartoDaPessoa: QuartoDoRooming, indice: number) => quartoDaPessoa.ocupantes[indice]!;

  it("dois quartos cheios do mesmo sexo: a troca cabe, porque cada uma ocupa a cama que a outra deixou", () => {
    const a = quarto("a", 2, "F", ["F", "F"]);
    const b = quarto("b", 2, null, ["F", "F"]);
    expect(podeOcupar(b, ocupante(a, 0))).toEqual({ ok: false, motivo: "QUARTO_CHEIO" });
    expect(podeTrocar({ quarto: a, pessoa: ocupante(a, 0) }, { quarto: b, pessoa: ocupante(b, 1) })).toEqual({ ok: true });
  });

  it.each<[string, QuartoDoRooming, number, QuartoDoRooming, number, ReturnType<typeof podeTrocar>]>([
    ["quem vem não é do sexo do quarto de destino", quarto("a", 2, "F", ["F", "F"]), 0, quarto("b", 2, null, ["M", "F"]), 0, { ok: false, motivo: "SEXO_DIFERENTE", quartoId: "a" }],
    ["quem vai não é do sexo do outro quarto", quarto("a", 2, null, ["M", "F"]), 0, quarto("b", 2, "F", ["F", "F"]), 0, { ok: false, motivo: "SEXO_DIFERENTE", quartoId: "b" }],
    ["sem sexo no cadastro indo para quarto separado por sexo", quarto("a", 2, "M", ["M"]), 0, quarto("b", 2, null, [null]), 0, { ok: false, motivo: "SEM_SEXO_NO_CADASTRO", quartoId: "a" }],
    ["quartos mistos aceitam qualquer troca", quarto("a", 1, null, ["M"]), 0, quarto("b", 3, null, ["F", null]), 1, { ok: true }],
  ])("%s", (_caso, quartoA, indiceA, quartoB, indiceB, esperado) => {
    expect(podeTrocar({ quarto: quartoA, pessoa: ocupante(quartoA, indiceA) }, { quarto: quartoB, pessoa: ocupante(quartoB, indiceB) })).toEqual(esperado);
  });

  it("o seletor \"Mover para…\" vira mover (quarto com vaga) ou trocar (pessoa de outro quarto)", () => {
    const quartoAtual = "018f4e2a-0000-7000-8000-000000000001";
    const convocacao = "018f4e2a-0000-7000-8000-000000000002";
    const outroQuarto = "018f4e2a-0000-7000-8000-000000000003";
    const outraPessoa = "018f4e2a-0000-7000-8000-000000000004";
    const ler = (destino: unknown) => moverDeQuartoSchema.safeParse({ quartoId: quartoAtual, pessoaId: convocacao, destino });

    expect(ler(destinoNoQuarto(outroQuarto))).toEqual({ success: true, data: { mover: { quartoId: outroQuarto, pessoaId: convocacao } } });
    expect(ler(destinoDaTroca(outroQuarto, outraPessoa))).toEqual({
      success: true,
      data: { trocar: { quartoId: quartoAtual, pessoaId: convocacao, comQuartoId: outroQuarto, comPessoaId: outraPessoa } },
    });
    for (const invalido of [undefined, "", outroQuarto, `quarto:${outroQuarto}:${outraPessoa}`, `troca:${outroQuarto}`, "troca:a:b", `outro:${outroQuarto}`]) {
      expect(ler(invalido).success).toBe(false);
    }
  });
});

describe("período próprio do ocupante", () => {
  const hospedagem = { checkIn: "2026-12-14", checkOut: "2026-12-18" };

  it("dentro da hospedagem vale; igual ao da hospedagem ou sem datas volta a segui-la", () => {
    expect(periodoProprio(hospedagem, { checkIn: "2026-12-15", checkOut: "2026-12-17" })).toEqual({ ok: true, periodo: { checkIn: "2026-12-15", checkOut: "2026-12-17" } });
    expect(periodoProprio(hospedagem, { ...hospedagem })).toEqual({ ok: true, periodo: null });
    expect(periodoProprio(hospedagem, null)).toEqual({ ok: true, periodo: null });
  });

  it.each([
    ["chega antes", { checkIn: "2026-12-13", checkOut: "2026-12-16" }],
    ["sai depois", { checkIn: "2026-12-15", checkOut: "2026-12-19" }],
  ])("recusa quem %s do período da hospedagem", (_caso, pedido) => {
    expect(periodoProprio(hospedagem, pedido)).toEqual({ ok: false, motivo: "FORA_DA_HOSPEDAGEM" });
  });

  it("a rooming list mostra as datas só de quem tem período próprio", () => {
    expect(nomeComPeriodo("Bia", { checkIn: "2026-12-15", checkOut: "2026-12-17" })).toBe("Bia (15/12 a 17/12)");
    expect(nomeComPeriodo("Bia", { checkIn: null, checkOut: null })).toBe("Bia");
  });

  it("o formulário exige as duas datas ou nenhuma, com check-out depois do check-in", () => {
    const ids = { quartoId: "018f4e2a-0000-7000-8000-000000000001", pessoaId: "018f4e2a-0000-7000-8000-000000000002" };
    expect(definirPeriodoDoOcupanteSchema.safeParse(ids).success).toBe(true);
    expect(definirPeriodoDoOcupanteSchema.safeParse({ ...ids, checkIn: "2026-12-15", checkOut: "2026-12-17" }).success).toBe(true);
    expect(definirPeriodoDoOcupanteSchema.safeParse({ ...ids, checkIn: "2026-12-15" }).success).toBe(false);
    expect(definirPeriodoDoOcupanteSchema.safeParse({ ...ids, checkIn: "2026-12-17", checkOut: "2026-12-17" }).success).toBe(false);
  });
});

describe("sugerirRooming por sexo", () => {
  it("prefere o quarto do mesmo sexo mais cheio, depois misto compatível, depois misto vazio", () => {
    const quartos = [quarto("f1", 2, "F"), quarto("f2", 2, "F", ["F"]), quarto("m1", 2, "M"), quarto("x1", 3, null, ["M"]), quarto("x2", 2, null)];
    const resultado = sugerirRooming(
      [
        { pessoaId: "ana", sexo: "F" },
        { pessoaId: "bia", sexo: "F" },
        { pessoaId: "caio", sexo: "M" },
        { pessoaId: "sem", sexo: null },
      ],
      quartos,
    );
    expect(resultado.alocacoes).toEqual([
      { pessoaId: "ana", quartoId: "f2" },
      { pessoaId: "bia", quartoId: "f1" },
      { pessoaId: "caio", quartoId: "m1" },
      { pessoaId: "sem", quartoId: "x2" },
    ]);
    expect(resultado.semLugar).toEqual([]);
  });

  it("quem não cabe fica de fora, sem misturar sexos em quarto separado", () => {
    const resultado = sugerirRooming(
      [
        { pessoaId: "ana", sexo: "F" },
        { pessoaId: "caio", sexo: "M" },
      ],
      [quarto("f1", 1, "F"), quarto("x1", 2, null, ["F"])],
    );
    expect(resultado).toEqual({ alocacoes: [{ pessoaId: "ana", quartoId: "f1" }], semLugar: ["caio"] });
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
  const ida = { sentido: "IDA", origemCidade: "  Porto  Alegre (RS) ", destinoCidade: "Manaus (AM)", dataDesejada: "2026-11-05" };

  it("pedido de voo: cidades sem espaço sobrando, sem sentido repetido, volta depois da ida", () => {
    // O pedido é de um evento e de uma pessoa do staff (a convocação não entra: o voo vem antes da escala).
    const pedido = { eventoId: convocacaoId, pessoaId: convocacaoId };
    expect(registrarPedidoDeVooSchema.parse({ ...pedido, trechos: [ida] }).trechos[0]?.origemCidade).toBe("Porto Alegre (RS)");
    expect(registrarPedidoDeVooSchema.safeParse({ convocacaoId, trechos: [ida] }).success).toBe(false);
    expect(registrarPedidoDeVooSchema.parse({ ...pedido, trechos: [ida] }).outraCompra).toBeUndefined();
    expect(registrarPedidoDeVooSchema.parse({ ...pedido, trechos: [ida], outraCompra: "on" }).outraCompra).toBe(true);
    expect(registrarPedidoDeVooSchema.safeParse({ ...pedido, trechos: [ida, ida] }).success).toBe(false);
    expect(
      registrarPedidoDeVooSchema.safeParse({
        ...pedido,
        trechos: [ida, { sentido: "VOLTA", origemCidade: "Manaus (AM)", destinoCidade: "Porto Alegre (RS)", dataDesejada: "2026-11-04" }],
      }).success,
    ).toBe(false);
    expect(registrarPedidoDeVooSchema.safeParse({ ...pedido, trechos: [{ ...ida, destinoCidade: "porto alegre (rs)" }] }).success).toBe(false);
  });

  it("retorno da hospedagem: o hotel que a SDC reservou (cadastrado ou novo), reserva, valor e forma de pagamento", () => {
    const base = { pedidoId: convocacaoId, valorCentavos: "2.400,00", numeroReserva: " RES-1 ", formaPagamento: FORMA_DE_PAGAMENTO_PADRAO };
    const cadastrado = registrarRetornoDeHospedagemSchema.parse({ ...base, localId: convocacaoId });
    expect(cadastrado).toMatchObject({ localId: convocacaoId, valorCentavos: 240000, numeroReserva: "RES-1", formaPagamento: "Faturado SDC" });
    expect(cadastrado.novoHotel).toBeUndefined();
    // "Cadastrar outro hotel…" manda o marcador no lugar do id e os campos do hotel novo.
    const novo = registrarRetornoDeHospedagemSchema.parse({ ...base, localId: NOVO_HOTEL, novoHotel: { nome: " Hotel Central ", cidade: "Manaus", uf: "am" } });
    expect(novo.localId).toBeUndefined();
    expect(novo.novoHotel).toEqual({ nome: "Hotel Central", cidade: "Manaus", uf: "AM" });
    // Um dos dois, nunca nenhum nem os dois; e a forma de pagamento é obrigatória.
    expect(registrarRetornoDeHospedagemSchema.safeParse(base).success).toBe(false);
    expect(registrarRetornoDeHospedagemSchema.safeParse({ ...base, localId: NOVO_HOTEL }).success).toBe(false);
    expect(registrarRetornoDeHospedagemSchema.safeParse({ ...base, localId: convocacaoId, novoHotel: { nome: "Hotel", cidade: "Manaus", uf: "AM" } }).success).toBe(false);
    expect(registrarRetornoDeHospedagemSchema.safeParse({ ...base, localId: convocacaoId, formaPagamento: "" }).success).toBe(false);
    expect(registrarRetornoDeHospedagemSchema.safeParse({ ...base, novoHotel: { nome: "H", cidade: "Manaus", uf: "AMA" } }).success).toBe(false);
  });

  it("hospedagem nasce sem hotel (a SDC escolhe) e os marcadores do evento aceitam marcar e desfazer", () => {
    const periodo = { checkIn: "2026-12-14", checkOut: "2026-12-18" };
    expect(criarHospedagemSchema.parse({ eventoId: convocacaoId, ...periodo }).localId).toBeUndefined();
    expect(criarHospedagemSchema.parse({ eventoId: convocacaoId, localId: convocacaoId, ...periodo }).localId).toBe(convocacaoId);
    expect(criarHospedagemSchema.safeParse({ eventoId: convocacaoId, checkIn: "2026-12-18", checkOut: "2026-12-14" }).success).toBe(false);
    expect(dispensarLogisticaDoEventoSchema.parse({ eventoId: convocacaoId, item: "VOO", dispensar: "true" })).toEqual({ eventoId: convocacaoId, item: "VOO", dispensar: true });
    expect(dispensarLogisticaDoEventoSchema.parse({ eventoId: convocacaoId, item: "HOSPEDAGEM", dispensar: "false" }).dispensar).toBe(false);
    expect(dispensarLogisticaDoEventoSchema.safeParse({ eventoId: convocacaoId, item: "CARONA", dispensar: "true" }).success).toBe(false);
  });

  it("texto da solicitação de hospedagem: evento, onde ele acontece, datas, quartos e pessoas; hotel só quando já existe", () => {
    const pedido = {
      referencia: "SDC-000007",
      eventoCodigo: "CONF_AM_60",
      eventoNome: "Confronto",
      localDoEvento: "Centro de Convenções — Manaus (AM)",
      hotel: null,
      checkIn: "2026-12-14",
      checkOut: "2026-12-18",
      quartos: [
        { nome: "Quarto 1", capacidade: 2, ocupantes: ["Pessoa Um", "Pessoa Dois"] },
        { nome: "Quarto 2", capacidade: 1, ocupantes: ["Pessoa Três"] },
        { nome: "Quarto 3", capacidade: 2, ocupantes: [] },
      ],
      observacaoTime: "Perto do evento",
    };
    expect(textoDoPedidoDeHospedagem(pedido).split("\n")).toEqual([
      "Pedido SDC-000007 — hospedagem",
      "Evento: CONF_AM_60",
      "Local do evento: Centro de Convenções — Manaus (AM)",
      "Check-in 14/12/2026 · check-out 18/12/2026",
      "3 quartos · 3 pessoas",
      "Quarto 1 (2 pessoas): Pessoa Um, Pessoa Dois",
      "Quarto 2 (1 pessoa): Pessoa Três",
      "Quarto 3 (2 pessoas): —",
      "Observação: Perto do evento",
    ]);
    const comHotel = textoDoPedidoDeHospedagem({ ...pedido, localDoEvento: null, hotel: "Hotel Central — Manaus (AM)", quartos: [pedido.quartos[1]!], observacaoTime: null });
    expect(comHotel.split("\n")).toEqual(["Pedido SDC-000007 — hospedagem", "Evento: CONF_AM_60", "Hotel: Hotel Central — Manaus (AM)", "Check-in 14/12/2026 · check-out 18/12/2026", "1 quarto · 1 pessoa", "Quarto 2 (1 pessoa): Pessoa Três"]);
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
