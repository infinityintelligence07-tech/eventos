import { describe, expect, it } from "vitest";

import {
  convocacaoAtiva,
  podeComunicar,
  type StatusConvocacao,
  type StatusEscala,
  transicaoDaComunicacao,
  transicaoDoConvite,
} from "../convite";

describe("convite: convocação ao enviar a copy de escalação", () => {
  it.each<[StatusConvocacao, ReturnType<typeof transicaoDoConvite>]>([
    ["SUGERIDA", { para: "CONVIDADA" }],
    ["CONVIDADA", { semMudanca: true }],
    ["ACEITA", { semMudanca: true }],
    ["RECUSADA", { erro: "CONVOCACAO_INATIVA" }],
    ["CANCELADA", { erro: "CONVOCACAO_INATIVA" }],
  ])("%s → %o", (status, esperado) => {
    expect(transicaoDoConvite(status)).toEqual(esperado);
  });

  it("valor fora do CHECK é erro de programação", () => {
    expect(() => transicaoDoConvite("ESCALADA" as StatusConvocacao)).toThrow(/desconhecido/);
  });

  it("ativa = SUGERIDA, CONVIDADA ou ACEITA", () => {
    expect((["SUGERIDA", "CONVIDADA", "ACEITA", "RECUSADA", "CANCELADA"] as const).filter(convocacaoAtiva)).toEqual([
      "SUGERIDA",
      "CONVIDADA",
      "ACEITA",
    ]);
  });
});

describe("comunicação da escala", () => {
  it.each<[StatusEscala, boolean]>([
    ["SEM_ESCALA", false],
    ["RASCUNHO", false],
    ["AGUARDANDO_APROVACAO", false],
    ["DEVOLVIDA", false],
    ["APROVADA", true],
    ["COMUNICADA", true],
  ])("podeComunicar(%s) = %s", (status, esperado) => {
    expect(podeComunicar(status)).toBe(esperado);
  });

  it.each<[StatusEscala, { ativas: number; semEnvio: number }, ReturnType<typeof transicaoDaComunicacao>]>([
    ["APROVADA", { ativas: 3, semEnvio: 0 }, { para: "COMUNICADA" }],
    ["APROVADA", { ativas: 3, semEnvio: 1 }, { semMudanca: true }],
    ["APROVADA", { ativas: 0, semEnvio: 0 }, { semMudanca: true }],
    ["COMUNICADA", { ativas: 3, semEnvio: 0 }, { semMudanca: true }],
    ["COMUNICADA", { ativas: 3, semEnvio: 2 }, { semMudanca: true }],
    ["SEM_ESCALA", { ativas: 0, semEnvio: 0 }, { semMudanca: true }],
    ["RASCUNHO", { ativas: 3, semEnvio: 0 }, { semMudanca: true }],
    ["AGUARDANDO_APROVACAO", { ativas: 3, semEnvio: 0 }, { semMudanca: true }],
    ["DEVOLVIDA", { ativas: 3, semEnvio: 0 }, { semMudanca: true }],
  ])("%s com %o → %o", (status, equipe, esperado) => {
    expect(transicaoDaComunicacao(status, equipe)).toEqual(esperado);
  });

  it("valor fora do CHECK é erro de programação", () => {
    expect(() => podeComunicar("PUBLICADA" as StatusEscala)).toThrow(/desconhecido/);
    expect(() => transicaoDaComunicacao("PUBLICADA" as StatusEscala, { ativas: 1, semEnvio: 0 })).toThrow(/desconhecido/);
  });
});
