import { describe, expect, it } from "vitest";

import {
  dataEmSaoPaulo,
  deslocarMes,
  escalaEmMontagem,
  type EventoNoCalendario,
  faixasDaSemana,
  mesDoTexto,
  nomeDoMes,
  noRecorte,
  ocorreNoDia,
  pendenciasDosEventos,
  recorteDoTexto,
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

  it("semanas de segunda a domingo cobrindo o mês", () => {
    const semanas = semanasDoMes({ ano: 2026, mes: 11 });
    // 01/11/2026 é domingo: fecha a semana que começou em outubro; 30/11 é segunda.
    expect(semanas[0]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(semanas.at(-1)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
    expect(semanas).toHaveLength(6);
    // 01/06/2026 é segunda: o mês começa na primeira coluna.
    expect(semanasDoMes({ ano: 2026, mes: 6 })[0]![0]).toBe("2026-06-01");
    expect(semanasDoMes({ ano: 2026, mes: 10 })[0]![0]).toBe("2026-09-28");
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

describe("atalho Todos | Eventos | Palestras", () => {
  it("palestra é a Masterclass; evento é todo o resto", () => {
    const masterclass = evento({ tipoSigla: "MC" });
    const confronto = evento({ tipoSigla: "CONF" });
    expect(noRecorte(masterclass, "palestras")).toBe(true);
    expect(noRecorte(confronto, "palestras")).toBe(false);
    expect(noRecorte(masterclass, "eventos")).toBe(false);
    expect(noRecorte(confronto, "eventos")).toBe(true);
    expect(noRecorte(masterclass, "todos")).toBe(true);
    expect(noRecorte(confronto, "todos")).toBe(true);
  });

  it("sem o filtro no endereço, ou com valor desconhecido, mostra todos", () => {
    expect(recorteDoTexto(undefined)).toBe("todos");
    expect(recorteDoTexto("")).toBe("todos");
    expect(recorteDoTexto("Palestras")).toBe("todos");
    expect(recorteDoTexto("eventos")).toBe("eventos");
    expect(recorteDoTexto("palestras")).toBe("palestras");
  });
});

describe("faixas contínuas na semana", () => {
  // Segunda 09/11 a domingo 15/11/2026.
  const semana = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
  const semanaSeguinte = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
  const item = (id: string, dataInicio: string, dataFim: string) => ({ id, dataInicio, dataFim });
  const resumo = (faixas: ReturnType<typeof faixasDaSemana<ReturnType<typeof item>>>) =>
    faixas.map(({ item: { id }, coluna, dias, linha }) => ({ id, coluna, dias, linha }));

  it("evento de um dia ocupa só a coluna do dia", () => {
    expect(faixasDaSemana(semana, [item("quarta", "2026-11-11", "2026-11-11")])).toEqual([
      { item: item("quarta", "2026-11-11", "2026-11-11"), coluna: 2, dias: 1, linha: 0, comecaAntes: false, continuaDepois: false },
    ]);
  });

  it("evento de três dias é uma faixa só, do primeiro ao último dia", () => {
    const [faixa] = faixasDaSemana(semana, [item("sexta-a-domingo", "2026-11-13", "2026-11-15")]);
    expect(faixa).toMatchObject({ coluna: 4, dias: 3, linha: 0, comecaAntes: false, continuaDepois: false });
  });

  it("evento que atravessa a semana quebra em duas faixas", () => {
    const sabadoATerca = [item("sabado-a-terca", "2026-11-14", "2026-11-17")];
    expect(faixasDaSemana(semana, sabadoATerca)[0]).toMatchObject({ coluna: 5, dias: 2, comecaAntes: false, continuaDepois: true });
    expect(faixasDaSemana(semanaSeguinte, sabadoATerca)[0]).toMatchObject({ coluna: 0, dias: 2, comecaAntes: true, continuaDepois: false });
  });

  it("evento maior que a semana ocupa as sete colunas", () => {
    const [faixa] = faixasDaSemana(semana, [item("longo", "2026-11-02", "2026-11-20")]);
    expect(faixa).toMatchObject({ coluna: 0, dias: 7, comecaAntes: true, continuaDepois: true });
  });

  it("evento que atravessa o mês aparece inteiro na semana da virada, nos dois meses", () => {
    // Sábado 28/11 a quarta 02/12: a semana de 30/11 a 06/12 está no calendário de novembro e no de dezembro.
    const virada = [item("virada", "2026-11-28", "2026-12-02")];
    const novembro = semanasDoMes({ ano: 2026, mes: 11 });
    const dezembro = semanasDoMes({ ano: 2026, mes: 12 });
    expect(faixasDaSemana(novembro.at(-2)!, virada)[0]).toMatchObject({ coluna: 5, dias: 2, continuaDepois: true });
    expect(faixasDaSemana(novembro.at(-1)!, virada)[0]).toMatchObject({ coluna: 0, dias: 3, comecaAntes: true, continuaDepois: false });
    expect(dezembro[0]).toEqual(novembro.at(-1));
    expect(faixasDaSemana(dezembro[1]!, virada)).toEqual([]);
  });

  it("eventos simultâneos empilham em linhas; quem não se encontra divide a mesma linha", () => {
    const faixas = faixasDaSemana(semana, [
      item("segunda-e-terca", "2026-11-09", "2026-11-10"),
      item("quinta-a-domingo", "2026-11-12", "2026-11-15"),
      item("sexta-a-domingo", "2026-11-13", "2026-11-15"),
      item("sabado", "2026-11-14", "2026-11-14"),
    ]);
    expect(resumo(faixas)).toEqual([
      { id: "segunda-e-terca", coluna: 0, dias: 2, linha: 0 },
      { id: "quinta-a-domingo", coluna: 3, dias: 4, linha: 0 },
      { id: "sexta-a-domingo", coluna: 4, dias: 3, linha: 1 },
      { id: "sabado", coluna: 5, dias: 1, linha: 2 },
    ]);
  });

  it("começando no mesmo dia, o mais longo fica em cima; no empate vale a ordem recebida", () => {
    const faixas = faixasDaSemana(semana, [
      item("curto", "2026-11-13", "2026-11-13"),
      item("longo", "2026-11-13", "2026-11-15"),
      item("longo-2", "2026-11-13", "2026-11-15"),
    ]);
    expect(resumo(faixas)).toEqual([
      { id: "longo", coluna: 4, dias: 3, linha: 0 },
      { id: "longo-2", coluna: 4, dias: 3, linha: 1 },
      { id: "curto", coluna: 4, dias: 1, linha: 2 },
    ]);
  });

  it("a linha de quem terminou é reaproveitada por quem começa depois", () => {
    const faixas = faixasDaSemana(semana, [
      item("segunda-a-quarta", "2026-11-09", "2026-11-11"),
      item("terca", "2026-11-10", "2026-11-10"),
      item("quarta-a-sexta", "2026-11-11", "2026-11-13"),
      item("quinta", "2026-11-12", "2026-11-12"),
    ]);
    expect(resumo(faixas)).toEqual([
      { id: "segunda-a-quarta", coluna: 0, dias: 3, linha: 0 },
      { id: "quinta", coluna: 3, dias: 1, linha: 0 },
      { id: "terca", coluna: 1, dias: 1, linha: 1 },
      { id: "quarta-a-sexta", coluna: 2, dias: 3, linha: 1 },
    ]);
  });

  it("fora da semana não vira faixa", () => {
    expect(faixasDaSemana(semana, [item("antes", "2026-11-06", "2026-11-08"), item("depois", "2026-11-16", "2026-11-16")])).toEqual([]);
    expect(faixasDaSemana([], [item("qualquer", "2026-11-11", "2026-11-11")])).toEqual([]);
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
