import { describe, expect, it } from "vitest";

import { DIAS_DE_PRAZO_DO_FORMULARIO, DIAS_PARA_CORRIGIR, diaEmSaoPaulo, podeCorrigirNoPrazo, prazoDaCorrecao, prazoDoFormulario, situacaoDoPrazo, somarDias } from "../prazo";

// São Paulo está em UTC-3 (sem horário de verão desde 2019): 03:00Z é a meia-noite de lá.
const evento = { dataInicio: "2026-12-15", dataFim: "2026-12-17" };

describe("prazo do formulário de custo do staff", () => {
  it("o prazo é de 5 dias depois do último dia do evento", () => {
    expect(DIAS_DE_PRAZO_DO_FORMULARIO).toBe(5);
    expect(prazoDoFormulario(evento)).toEqual({ abreEm: "2026-12-15", fechaEm: "2026-12-22" });
  });

  it("vira o mês e o ano na conta dos dias", () => {
    expect(prazoDoFormulario({ dataInicio: "2026-12-29", dataFim: "2026-12-30" }).fechaEm).toBe("2027-01-04");
    expect(somarDias("2028-02-27", 5)).toBe("2028-03-03");
  });

  it("evento de um dia (Masterclass): abre no dia e fecha 5 dias depois", () => {
    expect(prazoDoFormulario({ dataInicio: "2026-11-10", dataFim: "2026-11-10" })).toEqual({ abreEm: "2026-11-10", fechaEm: "2026-11-15" });
  });

  it("fim antes do início (dado errado): conta do início", () => {
    expect(prazoDoFormulario({ dataInicio: "2026-11-10", dataFim: "2026-11-08" }).fechaEm).toBe("2026-11-15");
  });

  it("abre à meia-noite de São Paulo do primeiro dia do evento", () => {
    expect(situacaoDoPrazo(evento, new Date("2026-12-15T02:59:59Z"))).toBe("AINDA_NAO_ABRIU");
    expect(situacaoDoPrazo(evento, new Date("2026-12-15T03:00:00Z"))).toBe("ABERTO");
  });

  it("fica aberto durante o evento e até o fim do 5º dia depois dele (inclusive)", () => {
    expect(situacaoDoPrazo(evento, new Date("2026-12-17T15:00:00Z"))).toBe("ABERTO");
    expect(situacaoDoPrazo(evento, new Date("2026-12-22T12:00:00Z"))).toBe("ABERTO");
    // 22/12 às 23:59:59 em São Paulo.
    expect(situacaoDoPrazo(evento, new Date("2026-12-23T02:59:59Z"))).toBe("ABERTO");
  });

  it("encerra à meia-noite de São Paulo do 6º dia", () => {
    expect(situacaoDoPrazo(evento, new Date("2026-12-23T03:00:00Z"))).toBe("ENCERRADO");
    expect(situacaoDoPrazo(evento, new Date("2027-01-10T12:00:00Z"))).toBe("ENCERRADO");
  });

  it("o dia é o de São Paulo, não o do servidor (UTC)", () => {
    expect(diaEmSaoPaulo(new Date("2026-12-23T01:30:00Z"))).toBe("2026-12-22");
    expect(diaEmSaoPaulo(new Date("2026-12-23T03:00:00Z"))).toBe("2026-12-23");
  });
});

describe("prazo para o staff corrigir a solicitação reprovada", () => {
  it("5 dias depois da reprovação, quando a auditoria acontece depois do prazo do evento", () => {
    expect(DIAS_PARA_CORRIGIR).toBe(5);
    const reprovadaEm = new Date("2027-01-04T14:00:00Z");
    expect(prazoDaCorrecao(evento, reprovadaEm)).toBe("2027-01-09");
    expect(podeCorrigirNoPrazo(evento, reprovadaEm, new Date("2027-01-10T02:59:59Z"))).toBe(true);
    expect(podeCorrigirNoPrazo(evento, reprovadaEm, new Date("2027-01-10T03:00:00Z"))).toBe(false);
  });

  it("nunca acaba antes do prazo do próprio evento", () => {
    // Reprovada no primeiro dia de um evento de três: reprovação + 5 = 20/12, mas o evento aceita envio até 22/12.
    const reprovadaEm = new Date("2026-12-15T18:00:00Z");
    expect(prazoDaCorrecao(evento, reprovadaEm)).toBe("2026-12-22");
    expect(podeCorrigirNoPrazo(evento, reprovadaEm, new Date("2026-12-22T20:00:00Z"))).toBe(true);
    expect(podeCorrigirNoPrazo(evento, reprovadaEm, new Date("2026-12-23T12:00:00Z"))).toBe(false);
  });

  it("sem a data da reprovação, vale o prazo do evento", () => {
    expect(podeCorrigirNoPrazo(evento, null, new Date("2026-12-22T12:00:00Z"))).toBe(true);
    expect(podeCorrigirNoPrazo(evento, null, new Date("2026-12-23T12:00:00Z"))).toBe(false);
  });
});
