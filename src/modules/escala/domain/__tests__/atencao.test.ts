import { describe, expect, it } from "vitest";

import { pontosDeAtencao } from "../atencao";

const vazia = { vagasAbertas: [], funcoesSemConfirmacao: [], disseramQueNaoPodem: 0, semRespostaNaEnquete: 0, vooSemPedido: 0, trainees: [] };

describe("pontos de atenção da aprovação", () => {
  it("nada a apontar", () => {
    expect(pontosDeAtencao(vazia)).toEqual([]);
  });

  it("lista vagas abertas, não pode, voo, enquete e trainees, nessa ordem", () => {
    expect(
      pontosDeAtencao({
        vagasAbertas: [
          { funcao: "Staff", abertas: 2 },
          { funcao: "DJ", abertas: 0 },
        ],
        funcoesSemConfirmacao: [],
        disseramQueNaoPodem: 1,
        semRespostaNaEnquete: 3,
        vooSemPedido: 2,
        trainees: [{ funcao: "Staff líder", quantidade: 1 }],
      }),
    ).toEqual([
      { tom: "atencao", texto: "2 vagas abertas em Staff" },
      { tom: "atencao", texto: "1 pessoa disse que não pode e ainda está na escala" },
      { tom: "atencao", texto: "2 pessoas vão de avião e ainda sem pedido de voo" },
      { tom: "informacao", texto: "3 pessoas sem resposta na enquete de disponibilidade" },
      { tom: "informacao", texto: "1 trainee em Staff líder" },
    ]);
  });
});
