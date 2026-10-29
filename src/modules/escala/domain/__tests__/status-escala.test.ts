import { describe, expect, it } from "vitest";

import type { StatusEscala } from "../convite";
import {
  type AcaoDaEscala,
  aceitaResposta,
  acaoRegistrada,
  conferirEnvio,
  escalaEditavel,
  motivoDaPendencia,
  transicaoDaEscala,
} from "../status-escala";

const TODOS: StatusEscala[] = ["SEM_ESCALA", "RASCUNHO", "AGUARDANDO_APROVACAO", "DEVOLVIDA", "APROVADA", "COMUNICADA"];

const VALIDAS: Record<AcaoDaEscala, Partial<Record<StatusEscala, StatusEscala>>> = {
  ENVIAR: { RASCUNHO: "AGUARDANDO_APROVACAO", DEVOLVIDA: "AGUARDANDO_APROVACAO" },
  APROVAR: { AGUARDANDO_APROVACAO: "APROVADA" },
  DEVOLVER: { AGUARDANDO_APROVACAO: "DEVOLVIDA" },
  REABRIR: { APROVADA: "RASCUNHO", COMUNICADA: "RASCUNHO" },
};

describe("máquina de estado da escala (docs/07 §4.1)", () => {
  const casos = (Object.keys(VALIDAS) as AcaoDaEscala[]).flatMap((acao) =>
    TODOS.map((de) => ({ acao, de, para: VALIDAS[acao][de] ?? null })),
  );

  it.each(casos)("$acao a partir de $de → $para", ({ acao, de, para }) => {
    expect(transicaoDaEscala(de, acao)).toEqual(para ? { para } : { erro: "TRANSICAO_INVALIDA" });
  });

  it("nomes no registro_acao seguem o CHECK", () => {
    for (const acao of Object.keys(VALIDAS) as AcaoDaEscala[]) expect(acaoRegistrada(acao)).toMatch(/^[A-Z_]{3,40}$/);
  });

  it.each([
    ["SEM_ESCALA", true, false],
    ["RASCUNHO", true, false],
    ["DEVOLVIDA", true, false],
    ["AGUARDANDO_APROVACAO", false, false],
    ["APROVADA", false, true],
    ["COMUNICADA", false, true],
  ] as const)("%s: editável %s, aceita resposta %s", (status, editavel, resposta) => {
    expect(escalaEditavel(status)).toBe(editavel);
    expect(aceitaResposta(status)).toBe(resposta);
  });
});

describe("conferência do envio para aprovação", () => {
  const linha = (funcao: string, confirmada: boolean, quantidade = 2, ativas = 2) => ({ funcao, nomeDaFuncao: funcao, quantidade, confirmada, ativas });

  it("tudo confirmado: pode, e conta as vagas abertas", () => {
    expect(conferirEnvio([linha("DJ", true, 1, 1), linha("LIDER", true, 8, 5)], [])).toEqual({ pode: true, vagasAbertas: 3 });
  });

  it("função sem número confirmado bloqueia e lista a função", () => {
    const conferencia = conferirEnvio([linha("DJ", true), linha("LIDER", false)], []);
    expect(conferencia).toEqual({ pode: false, motivos: ["Confirme o número de vagas de: LIDER."], funcoesSemConfirmacao: ["LIDER"] });
  });

  it("fila do Confronto e Staff digitado pendentes bloqueiam", () => {
    const conferencia = conferirEnvio([linha("DJ", true)], [
      { nomeDaFuncao: "Pai / mãe", motivo: "FALTA_FILA" },
      { nomeDaFuncao: "Staff", motivo: "DIGITAR" },
    ]);
    expect(conferencia.pode).toBe(false);
    expect(!conferencia.pode && conferencia.motivos).toEqual([
      "Informe as pessoas na fila para calcular: Pai / mãe.",
      "Digite e confirme o número de vagas de: Staff.",
    ]);
  });

  it("escala sem nenhuma função não pode ir para a líder", () => {
    expect(conferirEnvio([], [])).toMatchObject({ pode: false, motivos: ["Adicione ao menos uma função com vagas."] });
  });

  it("motivo da pendência do cálculo", () => {
    expect(motivoDaPendencia({ funcao: "PAI_MAE", variavel: "pessoas_na_fila" })).toBe("FALTA_FILA");
    expect(motivoDaPendencia({ funcao: "LIDER", variavel: "expectativa_publico" })).toBe("FALTA_PUBLICO");
    expect(motivoDaPendencia({ funcao: "STAFF", digitar: true })).toBe("DIGITAR");
  });
});
