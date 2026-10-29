import { describe, expect, it } from "vitest";

import { type LinhaDaMontagem, resumoDaMontagem } from "../montagem";

const REGRA = {
  funcoes: [
    { funcao: "LIDER", formula: "ceil(expectativa_publico / 25)" },
    { funcao: "PAI_MAE", formula: "ceil(pessoas_na_fila / 15)" },
    { funcao: "STAFF", digitado: true },
    { funcao: "DJ", fixo: 1 },
  ],
};
const nome = (codigo: string) => ({ LIDER: "Líder", PAI_MAE: "Pai / mãe", STAFF: "Staff", DJ: "DJ" })[codigo] ?? codigo;

const linha = (id: string, funcao: string, quantidade: number, dados: Partial<LinhaDaMontagem> = {}): LinhaDaMontagem => ({
  id,
  funcao,
  nomeDaFuncao: nome(funcao),
  data: "2026-11-12",
  quantidade,
  origem: "REGRA",
  confirmada: false,
  ativas: 0,
  ...dados,
});

describe("resumo da montagem", () => {
  it("Confronto sem fila e com Staff digitado: sugere líder e DJ, pende pai/mãe e Staff, e não deixa enviar", () => {
    const resumo = resumoDaMontagem(REGRA, { expectativa_publico: 180, pessoas_na_fila: null }, [linha("a", "LIDER", 8), linha("b", "DJ", 1)], nome);
    expect(resumo.linhas.map((item) => [item.funcao, item.sugerido])).toEqual([
      ["LIDER", 8],
      ["DJ", 1],
    ]);
    expect(resumo.pendencias).toEqual([
      { funcao: "PAI_MAE", nomeDaFuncao: "Pai / mãe", motivo: "FALTA_FILA" },
      { funcao: "STAFF", nomeDaFuncao: "Staff", motivo: "DIGITAR" },
    ]);
    expect(resumo.envio.pode).toBe(false);
  });

  it("Staff digitado com linha confirmada: sem sugestão, conta nas vagas e libera o envio com vagas abertas", () => {
    const resumo = resumoDaMontagem(
      REGRA,
      { expectativa_publico: 180, pessoas_na_fila: 90 },
      [
        linha("a", "LIDER", 8, { confirmada: true, ativas: 8 }),
        linha("b", "PAI_MAE", 6, { confirmada: true, ativas: 2 }),
        linha("c", "STAFF", 12, { confirmada: true, ativas: 12 }),
        linha("d", "DJ", 1, { confirmada: true, ativas: 1 }),
      ],
      nome,
    );
    expect(resumo.linhas.find((item) => item.funcao === "STAFF")).toMatchObject({ sugerido: null, digitada: true });
    expect(resumo).toMatchObject({ vagas: 27, preenchidas: 23, vagasAbertas: 4, pendencias: [], sugestoesMudadas: [] });
    expect(resumo.envio).toEqual({ pode: true, vagasAbertas: 4 });
  });

  it("aponta a sugestão que mudou depois de confirmada; linha manual não tem sugestão", () => {
    const resumo = resumoDaMontagem(
      REGRA,
      { expectativa_publico: 200, pessoas_na_fila: 90 },
      [linha("a", "LIDER", 7, { confirmada: true }), linha("m", "LIDER", 2, { origem: "MANUAL", confirmada: true })],
      nome,
    );
    expect(resumo.sugestoesMudadas).toEqual([{ nomeDaFuncao: "Líder", sugerido: 8, confirmado: 7 }]);
    expect(resumo.linhas[1]!.sugerido).toBeNull();
  });

  it("tipo sem regra e regra inválida", () => {
    expect(resumoDaMontagem({}, {}, [], nome)).toMatchObject({ semRegra: true, regraInvalida: null });
    const invalida = resumoDaMontagem({ funcoes: [{ funcao: "X" }] }, {}, [], nome);
    expect(invalida.semRegra).toBe(false);
    expect(invalida.regraInvalida?.length).toBeGreaterThan(0);
  });
});
