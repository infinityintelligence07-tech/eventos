import { describe, expect, it } from "vitest";

import {
  dataEmSaoPaulo,
  deslocarMes,
  escalaEmMontagem,
  type EventoNoCalendario,
  mesDoTexto,
  nomeDoMes,
  ocorreNoDia,
  pendenciasDosEventos,
  semanasDoMes,
  situacaoNoCalendario,
  type StatusEscala,
  ultimoDia,
} from "../calendario";

const evento = (dados: Partial<EventoNoCalendario> = {}): EventoNoCalendario => ({
  id: "e1",
  nome: "Confronto · ed. 60 · Americana",
  codigo: "CONF_AM_60",
  edicao: "60",
  tipoSigla: "CONF",
  tipoNome: "Confronto",
  poloCodigo: "AM",
  dataInicio: "2026-11-12",
  dataFim: "2026-11-15",
  status: "PLANEJADO",
  statusEscala: "RASCUNHO",
  expectativaPublico: 140,
  pessoasNaFila: null,
  vagas: 10,
  ...dados,
});

describe("mês do calendário", () => {
  it("lê o mês do endereço e cai para o mês de hoje", () => {
    expect(mesDoTexto("2026-11", "2026-10-28")).toEqual({ ano: 2026, mes: 11 });
    expect(mesDoTexto(undefined, "2026-10-28")).toEqual({ ano: 2026, mes: 10 });
    expect(mesDoTexto("2026-13", "2026-10-28")).toEqual({ ano: 2026, mes: 10 });
    expect(mesDoTexto("abc", "2026-10-28")).toEqual({ ano: 2026, mes: 10 });
  });

  it("anda entre meses e anos", () => {
    expect(deslocarMes({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(deslocarMes({ ano: 2026, mes: 1 }, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(ultimoDia({ ano: 2028, mes: 2 })).toBe("2028-02-29");
    expect(nomeDoMes({ ano: 2026, mes: 11 })).toBe("Novembro de 2026");
  });

  it("semanas de domingo a sábado cobrindo o mês", () => {
    const semanas = semanasDoMes({ ano: 2026, mes: 11 });
    // 01/11/2026 é domingo; 30/11 é segunda.
    expect(semanas[0]![0]).toBe("2026-11-01");
    expect(semanas.at(-1)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
    expect(semanas).toHaveLength(5);
    expect(semanasDoMes({ ano: 2026, mes: 10 })[0]![0]).toBe("2026-09-27");
  });

  it("data de hoje no fuso de São Paulo", () => {
    expect(dataEmSaoPaulo(new Date("2026-10-29T01:30:00Z"))).toBe("2026-10-28");
    expect(dataEmSaoPaulo(new Date("2026-10-29T03:00:00Z"))).toBe("2026-10-29");
  });

  it("evento aparece em todos os dias que dura", () => {
    expect(ocorreNoDia(evento(), "2026-11-11")).toBe(false);
    expect(ocorreNoDia(evento(), "2026-11-12")).toBe(true);
    expect(ocorreNoDia(evento(), "2026-11-15")).toBe(true);
    expect(ocorreNoDia(evento(), "2026-11-16")).toBe(false);
  });
});

describe("situação do evento no calendário", () => {
  it("cancelado vence; escala aprovada aparece mesmo concluído", () => {
    expect(situacaoNoCalendario({ status: "CANCELADO", statusEscala: "APROVADA" })).toBe("CANCELADO");
    expect(situacaoNoCalendario({ status: "CONCLUIDO", statusEscala: "COMUNICADA" })).toBe("COMUNICADA");
    expect(situacaoNoCalendario({ status: "CONCLUIDO", statusEscala: "RASCUNHO" })).toBe("CONCLUIDO");
    expect(situacaoNoCalendario({ status: "PLANEJADO", statusEscala: "SEM_ESCALA" })).toBe("SEM_ESCALA");
    expect(situacaoNoCalendario({ status: "EM_ANDAMENTO", statusEscala: "RASCUNHO" })).toBe("RASCUNHO");
  });

  it("aguardando aprovação e devolvida aparecem como tal; concluído ou cancelado vencem", () => {
    expect(situacaoNoCalendario({ status: "PLANEJADO", statusEscala: "AGUARDANDO_APROVACAO" })).toBe("AGUARDANDO_APROVACAO");
    expect(situacaoNoCalendario({ status: "EM_ANDAMENTO", statusEscala: "DEVOLVIDA" })).toBe("DEVOLVIDA");
    expect(situacaoNoCalendario({ status: "CONCLUIDO", statusEscala: "AGUARDANDO_APROVACAO" })).toBe("CONCLUIDO");
    expect(situacaoNoCalendario({ status: "CONCLUIDO", statusEscala: "DEVOLVIDA" })).toBe("CONCLUIDO");
    expect(situacaoNoCalendario({ status: "CANCELADO", statusEscala: "DEVOLVIDA" })).toBe("CANCELADO");
  });

  it("valor fora do CHECK é erro, não cor errada", () => {
    expect(() => situacaoNoCalendario({ status: "PLANEJADO", statusEscala: "ESCALADA" as StatusEscala })).toThrow(/desconhecido/);
    expect(() => escalaEmMontagem("ESCALADA" as StatusEscala)).toThrow(/desconhecido/);
  });

  it("em montagem: sem escala, rascunho e devolvida; com a líder ou aprovada, não", () => {
    expect(escalaEmMontagem("SEM_ESCALA")).toBe(true);
    expect(escalaEmMontagem("RASCUNHO")).toBe(true);
    expect(escalaEmMontagem("DEVOLVIDA")).toBe(true);
    expect(escalaEmMontagem("AGUARDANDO_APROVACAO")).toBe(false);
    expect(escalaEmMontagem("APROVADA")).toBe(false);
    expect(escalaEmMontagem("COMUNICADA")).toBe(false);
  });
});

describe("precisa de ação", () => {
  const hoje = "2026-10-28";

  it("Confronto sem fila, escalas a montar em 30 dias e eventos sem código", () => {
    const pendencias = pendenciasDosEventos(
      [
        evento({ id: "conf" }),
        evento({ id: "conf-com-fila", pessoasNaFila: 90 }),
        evento({ id: "longe", tipoSigla: "ASM", dataInicio: "2026-12-20", dataFim: "2026-12-22", codigo: null }),
        evento({ id: "aprovado", tipoSigla: "ASM", statusEscala: "APROVADA" }),
        evento({ id: "cancelado", status: "CANCELADO", codigo: null }),
        evento({ id: "mc", tipoSigla: "MC", codigo: null, dataInicio: "2026-11-02", dataFim: "2026-11-02" }),
        evento({ id: "passado", dataInicio: "2026-10-01", dataFim: "2026-10-04" }),
      ],
      hoje,
    );
    const ids = (lista: EventoNoCalendario[]) => lista.map((item) => item.id);
    expect(ids(pendencias.confrontoSemFila)).toEqual(["conf"]);
    expect(ids(pendencias.escalasAMontar)).toEqual(["conf", "conf-com-fila"]);
    expect(ids(pendencias.semCodigo)).toEqual(["longe"]);
  });

  it("devolvida volta para a montagem; aguardando aprovação está com a líder", () => {
    const pendencias = pendenciasDosEventos(
      [
        evento({ id: "devolvida", statusEscala: "DEVOLVIDA" }),
        evento({ id: "com-a-lider", statusEscala: "AGUARDANDO_APROVACAO" }),
      ],
      hoje,
    );
    const ids = (lista: EventoNoCalendario[]) => lista.map((item) => item.id);
    expect(ids(pendencias.escalasAMontar)).toEqual(["devolvida"]);
    expect(ids(pendencias.confrontoSemFila)).toEqual(["devolvida"]);
  });
});
