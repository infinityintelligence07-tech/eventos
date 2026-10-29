import { describe, expect, it } from "vitest";

import { dataEmSaoPaulo, diasEntre, instanteDeSaoPaulo, somarDias } from "../datas";
import { janelaDeCompra, precisaPedir } from "../janela";
import {
  type AcaoNoPedido,
  aguardandoSdc,
  pedidoAtivo,
  rotuloDaSituacaoDoVoo,
  type SituacaoDoPedido,
  textoDoPedidoDeVoo,
  transicaoDoPedido,
} from "../pedido";

describe("datas em São Paulo", () => {
  it.each([
    ["2026-10-29T02:59:00Z", "2026-10-28"],
    ["2026-10-29T03:00:00Z", "2026-10-29"],
    ["2026-12-31T23:00:00Z", "2026-12-31"],
  ])("%s é o dia %s", (instante, dia) => {
    expect(dataEmSaoPaulo(new Date(instante))).toBe(dia);
  });

  it("diasEntre e somarDias atravessam mês e ano", () => {
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
    expect(diasEntre("2027-01-02", "2026-12-30")).toBe(-3);
    expect(somarDias("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("datetime-local vira instante com -03:00", () => {
    expect(instanteDeSaoPaulo("2026-11-05T08:10").toISOString()).toBe("2026-11-05T11:10:00.000Z");
  });
});

describe("janela de compra (D-90 abre, a partir de D-60 atrasado)", () => {
  it.each<[string, ReturnType<typeof janelaDeCompra>]>([
    ["2027-02-01", { janela: "FORA_DA_JANELA", dias: 96 }],
    ["2027-01-27", { janela: "FORA_DA_JANELA", dias: 91 }],
    ["2027-01-26", { janela: "NA_JANELA", dias: 90 }],
    ["2026-12-28", { janela: "NA_JANELA", dias: 61 }],
    ["2026-12-27", { janela: "ATRASADO", dias: 60 }],
    ["2026-10-28", { janela: "ATRASADO", dias: 0 }],
  ])("evento em %s, hoje 2026-10-28 → %o", (dataDoEvento, esperado) => {
    expect(janelaDeCompra(dataDoEvento, "2026-10-28")).toEqual(esperado);
  });

  it("precisa pedir na janela e atrasado", () => {
    expect(precisaPedir("FORA_DA_JANELA")).toBe(false);
    expect(precisaPedir("NA_JANELA")).toBe(true);
    expect(precisaPedir("ATRASADO")).toBe(true);
  });
});

describe("máquina do pedido à SDC (§4.5)", () => {
  const tabela: [SituacaoDoPedido, AcaoNoPedido, ReturnType<typeof transicaoDoPedido>][] = [
    ["PEDIDO", "ALTERAR", { para: "PEDIDO" }],
    ["PEDIDO", "REGISTRAR_RETORNO", { para: "EMITIDO" }],
    ["PEDIDO", "CANCELAR", { para: "CANCELADO" }],
    ["EMITIDO", "ALTERAR", { para: "ALTERADO" }],
    ["EMITIDO", "REGISTRAR_RETORNO", { erro: "TRANSICAO_INVALIDA" }],
    ["EMITIDO", "CANCELAR", { para: "CANCELADO" }],
    ["ALTERADO", "ALTERAR", { para: "ALTERADO" }],
    ["ALTERADO", "REGISTRAR_RETORNO", { para: "EMITIDO" }],
    ["ALTERADO", "CANCELAR", { para: "CANCELADO" }],
    ["CANCELADO", "ALTERAR", { erro: "TRANSICAO_INVALIDA" }],
    ["CANCELADO", "REGISTRAR_RETORNO", { erro: "TRANSICAO_INVALIDA" }],
    ["CANCELADO", "CANCELAR", { erro: "TRANSICAO_INVALIDA" }],
  ];
  it.each(tabela)("%s + %s → %o", (atual, acao, esperado) => {
    expect(transicaoDoPedido(atual, acao)).toEqual(esperado);
  });

  it("valor fora do CHECK é erro de programação", () => {
    expect(() => transicaoDoPedido("A_PEDIR" as SituacaoDoPedido, "ALTERAR")).toThrow(/desconhecida/);
  });

  it("ativo e aguardando a SDC", () => {
    const todas: SituacaoDoPedido[] = ["PEDIDO", "EMITIDO", "ALTERADO", "CANCELADO"];
    expect(todas.filter(pedidoAtivo)).toEqual(["PEDIDO", "EMITIDO", "ALTERADO"]);
    expect(todas.filter(aguardandoSdc)).toEqual(["PEDIDO", "ALTERADO"]);
  });

  it("rótulos da doc 08 §13", () => {
    expect(rotuloDaSituacaoDoVoo("A_PEDIR")).toBe("A pedir");
    expect(rotuloDaSituacaoDoVoo("ALTERADO")).toBe("Alterado pelo time");
  });

  it("texto do pedido para a SDC, ida antes da volta", () => {
    expect(
      textoDoPedidoDeVoo({
        referencia: "SDC-000007",
        eventoCodigo: "ASM_AM_235",
        eventoNome: "ASM",
        passageiro: "Staff 07",
        observacaoTime: "Bagagem de mão",
        trechos: [
          { sentido: "VOLTA", origemIata: "MAO", destinoIata: "POA", dataDesejada: "2026-11-08", preferenciaHorario: null },
          { sentido: "IDA", origemIata: "POA", destinoIata: "MAO", dataDesejada: "2026-11-05", preferenciaHorario: "MANHA" },
        ],
      }),
    ).toBe(
      [
        "Pedido SDC-000007 — passagem aérea",
        "Evento: ASM_AM_235",
        "Passageiro: Staff 07",
        "Ida: POA → MAO em 05/11/2026 (manhã)",
        "Volta: MAO → POA em 08/11/2026",
        "Observação: Bagagem de mão",
      ].join("\n"),
    );
  });
});
