import { describe, expect, it } from "vitest";

import { carregarResumos, type ItemDoInicio, montarInicio } from "..";

const item = (chave: string, quantidade: number): ItemDoInicio => ({ chave, titulo: chave, quantidade, href: `/${chave}`, exemplos: [] });

describe("Início", () => {
  it("uma origem que falha vira cartão de erro e não derruba as outras", async () => {
    const resumos = await carregarResumos(new Date("2026-10-28T12:00:00Z"), [
      { origem: "escalas", nome: "Escalas", carregar: async () => [item("escalas-a-montar", 3), item("escalas-aguardando-aprovacao", 1)] },
      {
        origem: "comunicacao",
        nome: "Comunicação",
        carregar: async () => {
          throw new Error("banco fora");
        },
      },
      { origem: "custos", nome: "Custos", carregar: async () => [item("custos-para-auditar", 0)] },
    ]);
    const inicio = montarInicio(resumos);

    expect(inicio.cartoes[0]).toEqual({ tipo: "erro", origem: "comunicacao", nome: "Comunicação" });
    expect(inicio.numeros.map((numero) => [numero.rotulo, numero.valor])).toEqual([
      ["Escalas a montar", 3],
      ["Aguardando aprovação", 1],
      ["Copys bloqueadas", null],
      ["Custos para auditar", 0],
    ]);
    expect(inicio.tudoEmDia).toBe(false);
  });

  it("cartões na ordem da doc 08; chave desconhecida vai para o fim", () => {
    const { cartoes, tudoEmDia } = montarInicio([
      { origem: "custos", nome: "Custos", ok: true, itens: [item("custos-para-auditar", 0), item("chave-nova", 0)] },
      { origem: "escalas", nome: "Escalas", ok: true, itens: [item("escalas-a-montar", 0), item("escalas-aguardando-aprovacao", 0)] },
      { origem: "comunicacao", nome: "Comunicação", ok: true, itens: [item("comunicacao-falta-dado", 0)] },
    ]);
    expect(cartoes.map((cartao) => (cartao.tipo === "item" ? cartao.item.chave : cartao.origem))).toEqual([
      "comunicacao-falta-dado",
      "escalas-aguardando-aprovacao",
      "escalas-a-montar",
      "custos-para-auditar",
      "chave-nova",
    ]);
    expect(tudoEmDia).toBe(true);
  });
});
