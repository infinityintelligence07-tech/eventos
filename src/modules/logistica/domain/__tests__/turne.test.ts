import { describe, expect, it } from "vitest";

import { textoDoPedidoDeVoo } from "../pedido";
import { registrarCompraDeVooPelaSdcSchema, registrarPedidoDeHospedagemSchema, registrarPedidoDeVooSchema, registrarReservaPelaSdcSchema, registrarRetornoDeHospedagemSchema, registrarRetornoDeVooSchema } from "../schemas";
import { dataRealDoLancamento, type EventoDaTurne, localDaPalestra, mensagemDaRecusaDaTurne, noRecorte, recorteDaLogistica, validarTurne } from "../turne";

const palestra = (id: string, dataInicio: string, extras: Partial<EventoDaTurne> = {}): EventoDaTurne => ({ id, dataInicio, masterclass: true, cancelado: false, ...extras });

describe("voo de Masterclass: a turnê (ida para a primeira palestra, volta da última)", () => {
  const primeira = palestra("p1", "2027-03-10");
  const ultima = palestra("p3", "2027-03-14");

  it("uma palestra só (sem evento da volta, ou a mesma palestra) não grava evento da volta", () => {
    expect(validarTurne(primeira, null)).toEqual({ ok: true, eventoVoltaId: null });
    expect(validarTurne(primeira, primeira)).toEqual({ ok: true, eventoVoltaId: null });
    // Evento que não é Masterclass continua valendo, sem volta por outro evento.
    expect(validarTurne(palestra("ev", "2027-03-10", { masterclass: false }), null)).toEqual({ ok: true, eventoVoltaId: null });
  });

  it("turnê: a volta sai de outra Masterclass, no mesmo dia ou depois", () => {
    expect(validarTurne(primeira, ultima)).toEqual({ ok: true, eventoVoltaId: "p3" });
    expect(validarTurne(primeira, palestra("p2", "2027-03-10"))).toEqual({ ok: true, eventoVoltaId: "p2" });
  });

  it.each<[string, EventoDaTurne, EventoDaTurne, string]>([
    ["evento comum não tem volta por outro evento", palestra("ev", "2027-03-10", { masterclass: false }), ultima, "IDA_NAO_E_MASTERCLASS"],
    ["a última palestra precisa ser Masterclass", primeira, palestra("ev", "2027-03-14", { masterclass: false }), "VOLTA_NAO_E_MASTERCLASS"],
    ["a última palestra não pode estar cancelada", primeira, palestra("p3", "2027-03-14", { cancelado: true }), "VOLTA_CANCELADA"],
    ["a última não vem antes da primeira", ultima, primeira, "VOLTA_ANTES_DA_IDA"],
  ])("recusa: %s", (_caso, ida, volta, motivo) => {
    expect(validarTurne(ida, volta)).toEqual({ ok: false, motivo });
    expect(mensagemDaRecusaDaTurne(motivo as never)).toMatch(/palestra|Masterclass/);
  });

  it("o texto do pedido à SDC diz a primeira e a última palestra no lugar do evento", () => {
    const base = { referencia: "SDC-000001", eventoCodigo: "MC_AM_1", eventoNome: "Masterclass", passageiro: "Staff 07", trechos: [], observacaoTime: null };
    expect(textoDoPedidoDeVoo(base)).toContain("Evento: MC_AM_1");
    const daTurne = textoDoPedidoDeVoo({ ...base, turne: { primeiraPalestra: "10/03/2027 · Hotel A — Manaus (AM)", ultimaPalestra: "14/03/2027 · Hotel B — Belém (PA)" } });
    expect(daTurne).toContain("Masterclass (turnê) — primeira palestra: 10/03/2027 · Hotel A — Manaus (AM)");
    expect(daTurne).toContain("Última palestra: 14/03/2027 · Hotel B — Belém (PA)");
    expect(daTurne).not.toContain("Evento:");
  });

  it("local da palestra e recorte Eventos | Masterclass", () => {
    const evento = { localNome: "Hotel A", cidade: "Manaus", uf: "AM", codigo: "MC_AM_1", nome: "Masterclass" };
    expect(localDaPalestra(evento)).toBe("Hotel A — Manaus (AM)");
    expect(localDaPalestra({ ...evento, localNome: null })).toBe("Manaus (AM)");
    expect(localDaPalestra({ ...evento, localNome: null, cidade: null })).toBe("MC_AM_1");
    expect(localDaPalestra({ ...evento, localNome: null, cidade: null, codigo: null })).toBe("Masterclass");
    expect([recorteDaLogistica("masterclass"), recorteDaLogistica(undefined), recorteDaLogistica("MASTERCLASS"), recorteDaLogistica("x")]).toEqual(["MASTERCLASS", "EVENTOS", "EVENTOS", "EVENTOS"]);
    expect(noRecorte("MASTERCLASS", { masterclass: true })).toBe(true);
    expect(noRecorte("MASTERCLASS", { masterclass: false })).toBe(false);
    expect(noRecorte("EVENTOS", { masterclass: false })).toBe(true);
    expect(noRecorte("EVENTOS", { masterclass: true })).toBe(false);
  });
});

describe("data real da solicitação e da compra", () => {
  const hoje = "2026-11-25";

  it("sem data informada vale hoje; data passada é aceita; futura não", () => {
    expect(dataRealDoLancamento({ hoje })).toEqual({ ok: true, data: hoje });
    expect(dataRealDoLancamento({ informada: null, hoje })).toEqual({ ok: true, data: hoje });
    expect(dataRealDoLancamento({ informada: "2026-08-03", hoje })).toEqual({ ok: true, data: "2026-08-03" });
    expect(dataRealDoLancamento({ informada: hoje, hoje })).toEqual({ ok: true, data: hoje });
    expect(dataRealDoLancamento({ informada: "2026-11-26", hoje })).toEqual({ ok: false, motivo: "FUTURA" });
  });

  it("a compra não vem antes da solicitação (mas pode ser no mesmo dia)", () => {
    const naoAntesDe = "2026-10-01";
    expect(dataRealDoLancamento({ informada: "2026-10-01", hoje, naoAntesDe })).toEqual({ ok: true, data: "2026-10-01" });
    expect(dataRealDoLancamento({ informada: "2026-10-15", hoje, naoAntesDe })).toEqual({ ok: true, data: "2026-10-15" });
    expect(dataRealDoLancamento({ informada: "2026-09-30", hoje, naoAntesDe })).toEqual({ ok: false, motivo: "ANTES_DA_SOLICITACAO" });
    expect(dataRealDoLancamento({ informada: "2026-12-01", hoje, naoAntesDe })).toEqual({ ok: false, motivo: "FUTURA" });
    expect(dataRealDoLancamento({ hoje, naoAntesDe })).toEqual({ ok: true, data: hoje });
  });

  it("formulários: as datas são opcionais e validadas; a SDC informa só a da compra", () => {
    const id = "7e570000-0000-7000-8000-000000000002";
    const voo = { eventoId: id, pessoaId: id, trechos: [{ sentido: "IDA", origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", dataDesejada: "2026-11-05" }] };
    const semNada = registrarPedidoDeVooSchema.parse(voo);
    expect([semNada.eventoVoltaId, semNada.dataSolicitacao]).toEqual([undefined, undefined]);
    expect(registrarPedidoDeVooSchema.parse({ ...voo, eventoVoltaId: id, dataSolicitacao: "2026-08-03" })).toMatchObject({ eventoVoltaId: id, dataSolicitacao: "2026-08-03" });
    expect(registrarPedidoDeVooSchema.safeParse({ ...voo, dataSolicitacao: "03/08/2026" }).success).toBe(false);
    expect(registrarPedidoDeVooSchema.safeParse({ ...voo, dataSolicitacao: "2026-02-30" }).success).toBe(false);
    expect(registrarPedidoDeVooSchema.safeParse({ ...voo, eventoVoltaId: "outra-coisa" }).success).toBe(false);
    expect(registrarPedidoDeHospedagemSchema.parse({ hospedagemId: id, dataSolicitacao: "2026-08-03" }).dataSolicitacao).toBe("2026-08-03");

    const trecho = { sentido: "IDA", companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2026-11-05T08:10", chegadaEm: "2026-11-05T11:45" };
    const retorno = { pedidoId: id, valorCentavos: "980,00", trechos: [trecho] };
    const semData = registrarRetornoDeVooSchema.parse(retorno);
    expect([semData.dataCompra, semData.formaPagamento]).toEqual([undefined, undefined]);
    expect(registrarRetornoDeVooSchema.parse({ ...retorno, dataCompra: "2026-09-01", formaPagamento: "  Faturado   SDC " })).toMatchObject({ dataCompra: "2026-09-01", formaPagamento: "Faturado SDC" });
    expect(registrarRetornoDeVooSchema.safeParse({ ...retorno, dataCompra: "ontem" }).success).toBe(false);

    const compraDaSdc = { referencia: "SDC-000001", valorCentavos: "980,00", trechos: [trecho] };
    const lida = registrarCompraDeVooPelaSdcSchema.parse({ ...compraDaSdc, dataCompra: "2026-09-01", formaPagamento: "Faturado SDC", dataSolicitacao: "2020-01-01", eventoVoltaId: id });
    // A SDC não informa a data da solicitação nem mexe na turnê: os campos nem existem no schema dela.
    expect(Object.keys(lida).sort()).toEqual(["dataCompra", "formaPagamento", "referencia", "trechos", "valorCentavos"]);
    const reserva = { referencia: "SDC-000001", hotel: { nome: "Hotel Teste", cidade: "Manaus", uf: "AM" }, valorCentavos: "100,00", numeroReserva: "R1", formaPagamento: "Faturado SDC" };
    expect(registrarReservaPelaSdcSchema.parse({ ...reserva, dataCompra: "2026-09-01" }).dataCompra).toBe("2026-09-01");
  });

  it("forma de pagamento (voo e hospedagem, time e SDC): uma linha, sem link", () => {
    const id = "7e570000-0000-7000-8000-000000000002";
    const trecho = { sentido: "IDA", companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2026-11-05T08:10", chegadaEm: "2026-11-05T11:45" };
    const doTime = { pedidoId: id, valorCentavos: "980,00", trechos: [trecho] };
    const daSdc = { referencia: "SDC-000001", valorCentavos: "980,00", trechos: [trecho] };
    const hospedagem = { pedidoId: id, localId: id, valorCentavos: "100,00", numeroReserva: "R1" };
    for (const formaPagamento of ["Pague em www.exemplo.test", "Veja https://exemplo.test", "Faturado\nSDC", "F"]) {
      expect(registrarRetornoDeVooSchema.safeParse({ ...doTime, formaPagamento }).success, formaPagamento).toBe(false);
      expect(registrarCompraDeVooPelaSdcSchema.safeParse({ ...daSdc, formaPagamento }).success, formaPagamento).toBe(false);
      expect(registrarRetornoDeHospedagemSchema.safeParse({ ...hospedagem, formaPagamento }).success, formaPagamento).toBe(false);
    }
    expect(registrarRetornoDeHospedagemSchema.parse({ ...hospedagem, formaPagamento: "Cartão corporativo" }).formaPagamento).toBe("Cartão corporativo");
    // Na hospedagem a forma de pagamento continua obrigatória; no voo é opcional.
    expect(registrarRetornoDeHospedagemSchema.safeParse(hospedagem).success).toBe(false);
    expect(registrarCompraDeVooPelaSdcSchema.safeParse(daSdc).success).toBe(true);
  });
});
