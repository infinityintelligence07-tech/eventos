import { describe, expect, it } from "vitest";

import {
  EventoForaDaEnqueteError,
  filtrarLinhas,
  montarMatriz,
  type PessoaDaEnquete,
  planoDoRegistro,
  type Resposta,
  type RespostaAtual,
  respostaDe,
  type RespostaGravada,
  rotuloDaResposta,
} from "../respostas";

const ana: PessoaDaEnquete = { pessoaId: "p1", nome: "Ána Lúcia", poloCodigo: "AM", funcoes: [{ codigo: "STAFF", nome: "Staff" }] };
const bruno: PessoaDaEnquete = { pessoaId: "p2", nome: "Bruno", poloCodigo: "POA", funcoes: [{ codigo: "DJ", nome: "DJ" }] };
const carla: PessoaDaEnquete = { pessoaId: "p3", nome: "Carla", poloCodigo: null, funcoes: [] };

const resposta = (pessoaId: string, eventoId: string, disponivel: boolean, registradoPor: string | null = null, em = "2026-10-20T12:00:00Z"): RespostaGravada => ({
  pessoaId,
  eventoId,
  disponivel,
  registradoPor,
  respondidoEm: new Date(em),
});

describe("respostas", () => {
  it.each<[boolean | null, Resposta, string]>([
    [true, "PODE", "Pode"],
    [false, "NAO_PODE", "Não pode"],
    [null, "SEM_RESPOSTA", "Sem resposta"],
  ])("%s → %s (%s)", (disponivel, esperada, rotulo) => {
    expect(respostaDe(disponivel)).toBe(esperada);
    expect(rotuloDaResposta(esperada)).toBe(rotulo);
  });

  it("valor desconhecido é erro de programação", () => {
    expect(() => rotuloDaResposta("TALVEZ" as Resposta)).toThrow(/desconhecida/);
  });
});

describe("matriz pessoa × evento", () => {
  const matriz = montarMatriz(
    [ana, bruno, carla],
    ["e1", "e2"],
    [
      resposta("p1", "e1", true),
      resposta("p1", "e2", false, "time", "2026-10-21T12:00:00Z"),
      resposta("p2", "e2", true),
      resposta("p2", "e9", true), // evento fora da enquete não conta
    ],
  );

  it("células, totais e quem respondeu", () => {
    expect(matriz.linhas.map((linha) => linha.respostas)).toEqual([
      { e1: "PODE", e2: "NAO_PODE" },
      { e1: "SEM_RESPOSTA", e2: "PODE" },
      { e1: "SEM_RESPOSTA", e2: "SEM_RESPOSTA" },
    ]);
    expect(matriz.totais).toEqual([
      { eventoId: "e1", podem: 1, naoPodem: 0, semResposta: 2 },
      { eventoId: "e2", podem: 1, naoPodem: 1, semResposta: 1 },
    ]);
    expect(matriz.responderam).toBe(2);
  });

  it("selo 'Registrado pelo time' com a data da última resposta registrada pelo time", () => {
    expect(matriz.linhas.map((linha) => linha.registradoPeloTimeEm?.toISOString() ?? null)).toEqual(["2026-10-21T12:00:00.000Z", null, null]);
  });

  it.each<[Parameters<typeof filtrarLinhas>[1], string[]]>([
    [{}, ["p1", "p2", "p3"]],
    [{ busca: "ana luc" }, ["p1"]],
    [{ polo: "POA" }, ["p2"]],
    [{ funcao: "STAFF" }, ["p1"]],
    [{ soSemResposta: true }, ["p3"]],
    [{ busca: "c", soSemResposta: true }, ["p3"]],
  ])("filtros %o", (filtros, esperadas) => {
    expect(filtrarLinhas(matriz.linhas, filtros).map((linha) => linha.pessoa.pessoaId)).toEqual(esperadas);
  });
});

describe("plano do registro em nome da pessoa", () => {
  const atuais = new Map<string, RespostaAtual>([
    ["e1", { disponivel: true, enqueteId: "q1" }],
    ["e2", { disponivel: false, enqueteId: "q1" }],
    ["e3", { disponivel: true, enqueteId: "q0" }],
  ]);
  const plano = (pedidas: { eventoId: string; resposta: Resposta }[]) =>
    planoDoRegistro({ enqueteId: "q1", eventosDaEnquete: ["e1", "e2", "e3", "e4"], atuais, pedidas });

  it("igual na mesma enquete não muda; igual de outra enquete passa para esta; sem resposta apaga", () => {
    expect(
      plano([
        { eventoId: "e1", resposta: "PODE" },
        { eventoId: "e2", resposta: "PODE" },
        { eventoId: "e3", resposta: "PODE" },
        { eventoId: "e4", resposta: "NAO_PODE" },
      ]),
    ).toEqual([
      { tipo: "GRAVAR", eventoId: "e2", disponivel: true, de: "NAO_PODE" },
      { tipo: "GRAVAR", eventoId: "e3", disponivel: true, de: "PODE" },
      { tipo: "GRAVAR", eventoId: "e4", disponivel: false, de: "SEM_RESPOSTA" },
    ]);
    expect(
      plano([
        { eventoId: "e1", resposta: "SEM_RESPOSTA" },
        { eventoId: "e4", resposta: "SEM_RESPOSTA" },
      ]),
    ).toEqual([{ tipo: "APAGAR", eventoId: "e1", de: "PODE" }]);
  });

  it("evento fora da enquete é recusado", () => {
    expect(() => plano([{ eventoId: "e9", resposta: "PODE" }])).toThrow(EventoForaDaEnqueteError);
  });
});
