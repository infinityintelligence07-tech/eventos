import { describe, expect, it } from "vitest";

import { dataEmSaoPaulo, diasEntre, instanteDeSaoPaulo, somarDias } from "../datas";
import {
  DIAS_ABRE_A_JANELA,
  diasDoAtraso,
  diasDoAvisoConfigurado,
  eventoDeCasa,
  eventosSemPedidoDeVoo,
  janelaDeCompra,
  precisaPedir,
  textoDosDiasQueFaltam,
} from "../janela";
import { agruparPorMesEEvento, rotuloDoMes, rotuloDoTrajeto, trajetoDosTrechos } from "../planilha-de-voos";
import { salvarAvisoDeVoosSchema } from "../schemas";
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

describe("janela de compra com o aviso configurado (Configurações › Aviso de voos)", () => {
  it("sem dias informados vale o padrão de 90", () => {
    expect(DIAS_ABRE_A_JANELA).toBe(90);
    expect(janelaDeCompra("2027-01-26", "2026-10-28")).toEqual(janelaDeCompra("2027-01-26", "2026-10-28", 90));
  });

  it.each<[number, string, ReturnType<typeof janelaDeCompra>]>([
    // Aviso de 45 dias: atrasado a partir de 30.
    [45, "2026-12-13", { janela: "FORA_DA_JANELA", dias: 46 }],
    [45, "2026-12-12", { janela: "NA_JANELA", dias: 45 }],
    [45, "2026-11-28", { janela: "NA_JANELA", dias: 31 }],
    [45, "2026-11-27", { janela: "ATRASADO", dias: 30 }],
    // Aviso de 120 dias: abre antes, mas o atrasado continua em 60.
    [120, "2027-02-26", { janela: "FORA_DA_JANELA", dias: 121 }],
    [120, "2027-02-25", { janela: "NA_JANELA", dias: 120 }],
    [120, "2026-12-28", { janela: "NA_JANELA", dias: 61 }],
    [120, "2026-12-27", { janela: "ATRASADO", dias: 60 }],
    // Aviso no mínimo (7 dias): ainda sobra um trecho "na janela".
    [7, "2026-11-05", { janela: "FORA_DA_JANELA", dias: 8 }],
    [7, "2026-11-04", { janela: "NA_JANELA", dias: 7 }],
    [7, "2026-11-01", { janela: "ATRASADO", dias: 4 }],
  ])("aviso de %i dias, evento em %s, hoje 2026-10-28 → %o", (diasDoAviso, dataDoEvento, esperado) => {
    expect(janelaDeCompra(dataDoEvento, "2026-10-28", diasDoAviso)).toEqual(esperado);
  });

  it.each([
    [365, 60],
    [120, 60],
    [90, 60],
    [89, 59],
    [60, 40],
    [45, 30],
    [30, 20],
    [7, 4],
  ])("aviso de %i dias → atrasado a partir de %i (dois terços, no máximo 60)", (diasDoAviso, esperado) => {
    expect(diasDoAtraso(diasDoAviso)).toBe(esperado);
    // A regra continua coerente: o atrasado nunca chega ao dia em que o aviso abre.
    expect(diasDoAtraso(diasDoAviso)).toBeLessThan(diasDoAviso);
  });

  it.each<[string | null | undefined, number]>([
    [null, 90],
    [undefined, 90],
    ["", 90],
    ["45", 45],
    [" 120 ", 120],
    ["7", 7],
    ["365", 365],
    ["6", 90],
    ["366", 90],
    ["0", 90],
    ["-30", 90],
    ["45.5", 90],
    ["noventa", 90],
  ])("configuração %o → %i dias (inválido cai no padrão)", (valor, esperado) => {
    expect(diasDoAvisoConfigurado(valor)).toBe(esperado);
  });

  it("o formulário aceita só inteiro de 7 a 365", () => {
    const ler = (dias: unknown) => salvarAvisoDeVoosSchema.safeParse({ dias });
    expect(ler("90")).toEqual({ success: true, data: { dias: 90 } });
    expect(ler(" 7 ")).toEqual({ success: true, data: { dias: 7 } });
    expect(ler("365").success).toBe(true);
    for (const invalido of ["6", "366", "0", "-5", "45,5", "45.5", "abc", "99999", undefined]) expect(ler(invalido).success).toBe(false);
  });

  it("aviso da tela, por evento: entrou no prazo e ainda não tem nenhum pedido de voo, o mais próximo primeiro", () => {
    const evento = (id: string, dataInicio: string, semVoo = false) => ({ id, codigo: id.toUpperCase(), nome: id, dataInicio, semVoo });
    const eventos = [
      evento("longe", "2027-03-01"),
      evento("na-janela", "2027-01-10"),
      evento("atrasado", "2026-12-15"),
      evento("com-pedido", "2026-12-20"),
      evento("de-casa", "2026-12-01", true),
      evento("ja-comecou", "2026-10-27"),
      evento("hoje", "2026-10-28"),
    ];
    const comPedido = new Set(["com-pedido"]);
    const marcadas = new Map([["atrasado", 3]]);

    expect(eventosSemPedidoDeVoo(eventos, comPedido, marcadas, "2026-10-28")).toEqual([
      { eventoId: "hoje", codigo: "HOJE", nome: "hoje", dataInicio: "2026-10-28", marcadasComoAviao: 0, janela: "ATRASADO", dias: 0 },
      { eventoId: "atrasado", codigo: "ATRASADO", nome: "atrasado", dataInicio: "2026-12-15", marcadasComoAviao: 3, janela: "ATRASADO", dias: 48 },
      { eventoId: "na-janela", codigo: "NA-JANELA", nome: "na-janela", dataInicio: "2027-01-10", marcadasComoAviao: 0, janela: "NA_JANELA", dias: 74 },
    ]);
    const ids = (diasDoAviso: number, pedidos = comPedido) => eventosSemPedidoDeVoo(eventos, pedidos, marcadas, "2026-10-28", diasDoAviso).map((item) => `${item.eventoId}:${item.janela}`);
    // Aviso de 60 dias: o evento a 74 dias sai do aviso e o de 48 dias deixa de estar atrasado (limite 40).
    expect(ids(60)).toEqual(["hoje:ATRASADO", "atrasado:NA_JANELA"]);
    // Aviso de 150 dias: o evento distante entra. O marcado como "não precisa de voo" e o que já tem pedido, nunca.
    expect(ids(150)).toEqual(["hoje:ATRASADO", "atrasado:ATRASADO", "na-janela:NA_JANELA", "longe:NA_JANELA"]);
    // Sem nenhum pedido registrado, o evento que tinha pedido também entra; o que já começou continua de fora.
    expect(ids(90, new Set())).toEqual(["hoje:ATRASADO", "atrasado:ATRASADO", "com-pedido:ATRASADO", "na-janela:NA_JANELA"]);
    expect(eventosSemPedidoDeVoo([], comPedido, marcadas, "2026-10-28")).toEqual([]);
  });

  it("textos do aviso", () => {
    expect([textoDosDiasQueFaltam(12), textoDosDiasQueFaltam(1), textoDosDiasQueFaltam(0)]).toEqual(["faltam 12 dias", "falta 1 dia", "é hoje"]);
  });
});

describe("a tela de Voos lê como a planilha (mês → evento → uma linha por compra)", () => {
  it("trajeto pelos trechos do pedido", () => {
    expect([trajetoDosTrechos(["IDA", "VOLTA"]), trajetoDosTrechos(["VOLTA", "IDA"]), trajetoDosTrechos(["IDA"]), trajetoDosTrechos(["VOLTA"]), trajetoDosTrechos([])]).toEqual([
      "IDA_E_VOLTA",
      "IDA_E_VOLTA",
      "IDA",
      "VOLTA",
      null,
    ]);
    expect([rotuloDoTrajeto("IDA_E_VOLTA"), rotuloDoTrajeto("IDA"), rotuloDoTrajeto("VOLTA")]).toEqual(["Ida e volta", "Ida", "Volta"]);
    expect([rotuloDoMes("2026-12"), rotuloDoMes("2027-01"), rotuloDoMes("2027-03")]).toEqual(["Dezembro de 2026", "Janeiro de 2027", "Março de 2027"]);
  });

  it("agrupa por mês e por evento na ordem das datas, mantendo a ordem das linhas dentro do evento", () => {
    const janeiro = { id: "b", dataInicio: "2027-01-08" };
    const dezembroA = { id: "a", dataInicio: "2026-12-16" };
    const dezembroB = { id: "c", dataInicio: "2026-12-16" };
    const dezembroCedo = { id: "z", dataInicio: "2026-12-02" };
    const linhas = [
      { evento: janeiro, nome: "um" },
      { evento: dezembroB, nome: "dois" },
      { evento: dezembroA, nome: "três" },
      { evento: dezembroCedo, nome: "quatro" },
      { evento: dezembroA, nome: "cinco" },
      { evento: janeiro, nome: "seis" },
    ];
    expect(agruparPorMesEEvento(linhas).map((mes) => [mes.mes, mes.eventos.map((grupo) => [grupo.evento.id, grupo.linhas.map((linha) => linha.nome)])])).toEqual([
      [
        "2026-12",
        [
          ["z", ["quatro"]],
          ["a", ["três", "cinco"]],
          ["c", ["dois"]],
        ],
      ],
      ["2027-01", [["b", ["um", "seis"]]]],
    ]);
    expect(agruparPorMesEEvento([])).toEqual([]);
  });
});

describe("máquina do pedido à SDC (§4.5)", () => {
  const tabela: [SituacaoDoPedido, AcaoNoPedido, ReturnType<typeof transicaoDoPedido>][] = [
    ["PEDIDO", "ALTERAR", { para: "PEDIDO" }],
    ["PEDIDO", "REGISTRAR_RETORNO", { para: "EMITIDO" }],
    ["PEDIDO", "CANCELAR", { para: "CANCELADO" }],
    ["EMITIDO", "ALTERAR", { para: "ALTERADO" }],
    // Corrigir a compra já registrada (a aprovação do pagamento é decidida em domain/pagamento.ts).
    ["EMITIDO", "REGISTRAR_RETORNO", { para: "EMITIDO" }],
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
          { sentido: "VOLTA", origemCidade: "Manaus (AM)", destinoCidade: "Porto Alegre (RS)", origemIata: null, destinoIata: null, dataDesejada: "2026-11-08", preferenciaHorario: null },
          { sentido: "IDA", origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", origemIata: null, destinoIata: null, dataDesejada: "2026-11-05", preferenciaHorario: "MANHA" },
        ],
      }),
    ).toBe(
      [
        "Pedido SDC-000007 — passagem aérea",
        "Evento: ASM_AM_235",
        "Passageiro: Staff 07",
        "Ida: Porto Alegre (RS) → Manaus (AM) em 05/11/2026 (manhã)",
        "Volta: Manaus (AM) → Porto Alegre (RS) em 08/11/2026",
        "Observação: Bagagem de mão",
      ].join("\n"),
    );
  });
});

describe("polo de casa", () => {
  it("só o polo Americana (AM) fica fora do aviso de voos; sem polo ou outro polo entra", () => {
    expect(eventoDeCasa("AM")).toBe(true);
    expect([eventoDeCasa("POA"), eventoDeCasa("am"), eventoDeCasa(null), eventoDeCasa(undefined)]).toEqual([false, false, false, false]);
  });
});
