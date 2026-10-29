import { describe, expect, it } from "vitest";

import { regrasVagasDaMigration } from "@/test/seeds";

import { descreverLinha, type LinhaGuiada, lerRegraGuiada, regraDasLinhas } from "../regra-guiada";
import { calcularVagas, RegraVagasInvalidaError } from "../vagas";

const regras = regrasVagasDaMigration();
const nome = (codigo: string) => ({ STAFF_LIDER: "Staff líder" })[codigo] ?? codigo;

describe("regra de vagas em formulário guiado", () => {
  it("lê as regras da migration sem perder nada", () => {
    expect(lerRegraGuiada(regras.CONF)).toEqual([
      { funcao: "LIDER", modo: "POR_PUBLICO", cada: 25 },
      { funcao: "PAI_MAE", modo: "POR_FILA", cada: 15 },
      { funcao: "DJ", modo: "FIXO", quantidade: 1 },
      { funcao: "SOCIAL_MEDIA", modo: "FIXO", quantidade: 1 },
      { funcao: "FOTOGRAFO", modo: "FIXO", quantidade: 1 },
      { funcao: "CAMARIM", modo: "FIXO", quantidade: 1 },
    ]);
    // ASM: "ceil(expectativa_publico * 0.5 / 25)" é 1 a cada 50; "2 * STAFF_LIDER" é proporcional.
    expect(lerRegraGuiada(regras.ASM).slice(0, 2)).toEqual([
      { funcao: "STAFF_LIDER", modo: "POR_PUBLICO", cada: 50 },
      { funcao: "STAFF", modo: "POR_FUNCAO", multiplicador: 2, base: "STAFF_LIDER" },
    ]);
    expect(lerRegraGuiada({})).toEqual([]);
  });

  it.each(Object.entries(regras))("%s: gravar o que foi lido calcula as mesmas vagas", (_sigla, regra) => {
    const regravada = regraDasLinhas(lerRegraGuiada(regra));
    for (const dados of [{ expectativa_publico: 180, pessoas_na_fila: 90 }, { expectativa_publico: 421 }, {}]) {
      expect(calcularVagas(regravada, dados)).toEqual(calcularVagas(regra, dados));
    }
  });

  it("Staff digitado vira pendência de digitar, sem número", () => {
    const linhas: LinhaGuiada[] = [
      { funcao: "LIDER", modo: "POR_PUBLICO", cada: 25 },
      { funcao: "STAFF", modo: "DIGITADO" },
    ];
    const regra = regraDasLinhas(linhas);
    expect(regra).toEqual({ funcoes: [{ funcao: "LIDER", formula: "ceil(expectativa_publico / 25)" }, { funcao: "STAFF", digitado: true }] });
    expect(calcularVagas(regra, { expectativa_publico: 180 })).toEqual({
      vagas: [{ funcao: "LIDER", quantidade: 8 }],
      pendencias: [{ funcao: "STAFF", digitar: true }],
    });
  });

  it("fórmula que não cabe num modo fica personalizada e é mantida igual", () => {
    const regra = { funcoes: [{ funcao: "SOM", formula: "max(1, floor(expectativa_publico / 300))" }] };
    const linhas = lerRegraGuiada(regra);
    expect(linhas).toEqual([{ funcao: "SOM", modo: "PERSONALIZADA", formula: "max(1, floor(expectativa_publico / 300))" }]);
    expect(regraDasLinhas(linhas)).toEqual(regra);
  });

  it("recusa função repetida e proporção a uma função que vem depois", () => {
    expect(() => regraDasLinhas([{ funcao: "DJ", modo: "FIXO", quantidade: 1 }, { funcao: "DJ", modo: "DIGITADO" }])).toThrow(RegraVagasInvalidaError);
    expect(() =>
      regraDasLinhas([
        { funcao: "STAFF", modo: "POR_FUNCAO", multiplicador: 2, base: "STAFF_LIDER" },
        { funcao: "STAFF_LIDER", modo: "FIXO", quantidade: 1 },
      ]),
    ).toThrow(RegraVagasInvalidaError);
  });

  it.each<[LinhaGuiada, string]>([
    [{ funcao: "DJ", modo: "FIXO", quantidade: 1 }, "1 fixo"],
    [{ funcao: "LIDER", modo: "POR_PUBLICO", cada: 25 }, "1 a cada 25 pessoas do público, arredondando para cima"],
    [{ funcao: "PAI_MAE", modo: "POR_FILA", cada: 15 }, "1 a cada 15 pessoas na fila, arredondando para cima"],
    [{ funcao: "STAFF", modo: "POR_FUNCAO", multiplicador: 2, base: "STAFF_LIDER" }, "2 para cada vaga de Staff líder"],
    [{ funcao: "STAFF", modo: "DIGITADO" }, "definido em cada evento"],
  ])("descreve %j", (linha, texto) => {
    expect(descreverLinha(linha, nome)).toBe(texto);
  });
});
