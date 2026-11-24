import { describe, expect, it } from "vitest";

import type { EventoNoCalendario } from "../../domain/calendario";
import type { FiltrosDoPeriodo, RepositorioCalendario } from "../../repository/calendario-repository";
import { carregarCalendario } from "../calendario";

const evento = (dados: Partial<EventoNoCalendario> & Pick<EventoNoCalendario, "id">): EventoNoCalendario => ({
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

const masterclass = (id: string, dia: string, dados: Partial<EventoNoCalendario> = {}) =>
  evento({ id, nome: `Masterclass · ${id}`, codigo: null, edicao: null, tipoSigla: "MC", tipoNome: "Masterclass", dataInicio: dia, dataFim: dia, vagas: 2, ...dados });

function repositorioCom(eventos: EventoNoCalendario[]) {
  const pedidos: FiltrosDoPeriodo[] = [];
  const repositorio: RepositorioCalendario = {
    async eventosDoPeriodo(filtros) {
      pedidos.push(filtros);
      return eventos.filter((item) => !filtros.tipoSigla || item.tipoSigla === filtros.tipoSigla);
    },
    async eventoDoCabecalho() {
      return null;
    },
    async opcoesDeFiltro() {
      return {
        polos: [{ codigo: "AM", nome: "Americana" }],
        tipos: [
          { sigla: "ASM", nome: "A Sua Melhor Versão" },
          { sigla: "CONF", nome: "Confronto" },
          { sigla: "MC", nome: "Masterclass" },
        ],
      };
    },
    async ultimaSincronizacao() {
      return null;
    },
  };
  return { repositorio, pedidos };
}

const agora = new Date("2026-11-10T15:00:00Z");
const DO_MES = [
  evento({ id: "confronto" }),
  evento({ id: "asm", tipoSigla: "ASM", tipoNome: "A Sua Melhor Versão", dataInicio: "2026-11-13", dataFim: "2026-11-15" }),
  masterclass("mc-campinas", "2026-11-12"),
  masterclass("mc-limeira", "2026-11-12"),
  masterclass("mc-cancelada", "2026-11-14", { status: "CANCELADO" }),
];

const idsDasFaixas = (calendario: Awaited<ReturnType<typeof carregarCalendario>>) =>
  calendario.semanas.flatMap((semana) => semana.faixas.map((faixa) => faixa.item.id));
const idsRecolhidos = (calendario: Awaited<ReturnType<typeof carregarCalendario>>) =>
  calendario.semanas.flatMap((semana) => semana.dias.flatMap((dia) => dia.masterclasses.map((mc) => `${dia.data}:${mc.id}`)));

describe("calendário do mês", () => {
  it("semanas de segunda a domingo, com o dia de hoje e os dias de fora do mês marcados", async () => {
    const { repositorio, pedidos } = repositorioCom([]);
    const calendario = await carregarCalendario(repositorio, { agora });
    expect(calendario.mes).toBe("2026-11");
    expect(pedidos).toEqual([{ de: "2026-10-26", ate: "2026-12-06", poloCodigo: undefined, tipoSigla: undefined }]);
    expect(calendario.semanas).toHaveLength(6);
    expect(calendario.semanas[0]!.dias.map((dia) => dia.doMes)).toEqual([false, false, false, false, false, false, true]);
    expect(calendario.semanas.flatMap((semana) => semana.dias).filter((dia) => dia.hoje).map((dia) => dia.data)).toEqual(["2026-11-10"]);
  });

  it("todos (padrão): cada evento é uma faixa contínua e as Masterclasses ficam recolhidas no dia", async () => {
    const calendario = await carregarCalendario(repositorioCom(DO_MES).repositorio, { agora });
    expect(calendario.filtros.recorte).toBe("todos");
    const semana = calendario.semanas.find((item) => item.dias[0]!.data === "2026-11-09")!;
    expect(semana.faixas.map(({ item, coluna, dias, linha }) => ({ id: item.id, coluna, dias, linha }))).toEqual([
      { id: "confronto", coluna: 3, dias: 4, linha: 0 },
      { id: "asm", coluna: 4, dias: 3, linha: 1 },
    ]);
    expect(idsDasFaixas(calendario)).toEqual(["confronto", "asm"]);
    expect(idsRecolhidos(calendario)).toEqual(["2026-11-12:mc-campinas", "2026-11-12:mc-limeira", "2026-11-14:mc-cancelada"]);
    expect(calendario.resumo).toEqual({ eventos: 2, masterclasses: 2, vagas: 24 });
  });

  it("eventos: tira as Masterclasses da tela, da contagem e do seletor de tipo", async () => {
    const calendario = await carregarCalendario(repositorioCom(DO_MES).repositorio, { agora, mostrar: "eventos" });
    expect(idsDasFaixas(calendario)).toEqual(["confronto", "asm"]);
    expect(idsRecolhidos(calendario)).toEqual([]);
    expect(calendario.resumo).toEqual({ eventos: 2, masterclasses: 0, vagas: 20 });
    expect(calendario.filtros.tipos.map((tipo) => tipo.sigla)).toEqual(["ASM", "CONF"]);
  });

  it("palestras: só Masterclasses, cada uma como faixa, empilhadas no mesmo dia", async () => {
    const calendario = await carregarCalendario(repositorioCom(DO_MES).repositorio, { agora, mostrar: "palestras" });
    const semana = calendario.semanas.find((item) => item.dias[0]!.data === "2026-11-09")!;
    expect(semana.faixas.map(({ item, coluna, dias, linha }) => ({ id: item.id, coluna, dias, linha }))).toEqual([
      { id: "mc-campinas", coluna: 3, dias: 1, linha: 0 },
      { id: "mc-cancelada", coluna: 5, dias: 1, linha: 0 },
      { id: "mc-limeira", coluna: 3, dias: 1, linha: 1 },
    ]);
    expect(idsRecolhidos(calendario)).toEqual([]);
    expect(calendario.resumo).toEqual({ eventos: 0, masterclasses: 2, vagas: 4 });
    expect(calendario.filtros.tipos.map((tipo) => tipo.sigla)).toEqual(["MC"]);
  });

  it("o filtro de tipo continua valendo junto com o atalho", async () => {
    const { repositorio, pedidos } = repositorioCom(DO_MES);
    const calendario = await carregarCalendario(repositorio, { agora, mostrar: "eventos", tipo: "ASM", polo: "AM" });
    expect(pedidos[0]).toMatchObject({ tipoSigla: "ASM", poloCodigo: "AM" });
    expect(calendario.filtros).toMatchObject({ tipo: "ASM", polo: "AM", recorte: "eventos" });
    expect(idsDasFaixas(calendario)).toEqual(["asm"]);
  });

  it("tipo de fora do atalho é ignorado em vez de esvaziar a tela", async () => {
    const { repositorio, pedidos } = repositorioCom(DO_MES);
    const palestras = await carregarCalendario(repositorio, { agora, mostrar: "palestras", tipo: "CONF" });
    expect(palestras.filtros.tipo).toBeNull();
    expect(pedidos[0]!.tipoSigla).toBeUndefined();
    expect(idsDasFaixas(palestras)).toEqual(["mc-campinas", "mc-cancelada", "mc-limeira"]);

    const eventos = await carregarCalendario(repositorio, { agora, mostrar: "eventos", tipo: "MC" });
    expect(eventos.filtros.tipo).toBeNull();
    expect(idsDasFaixas(eventos)).toEqual(["confronto", "asm"]);
  });

  it("atalho desconhecido no endereço cai em todos", async () => {
    const calendario = await carregarCalendario(repositorioCom(DO_MES).repositorio, { agora, mostrar: "xyz" });
    expect(calendario.filtros.recorte).toBe("todos");
    expect(idsRecolhidos(calendario)).toHaveLength(3);
  });
});
