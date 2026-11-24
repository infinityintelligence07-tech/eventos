import { describe, expect, it } from "vitest";

import { itemAtivoDoMenu, ROTAS_DO_MENU } from "../menu";

describe("item ativo do menu", () => {
  it("acende pela rota e pelas subrotas", () => {
    expect(itemAtivoDoMenu("/calendario")).toBe("Calendário");
    expect(itemAtivoDoMenu("/escalas/aprovacao")).toBe("Escalas");
    expect(itemAtivoDoMenu("/configuracoes/vagas")).toBe("Configurações");
    expect(itemAtivoDoMenu("/disponibilidade/nova")).toBe("Disponibilidade");
  });

  it("Voos e Hospedagem são itens separados: cada um acende só nas suas telas", () => {
    expect(itemAtivoDoMenu("/logistica/voos")).toBe("Voos");
    expect(itemAtivoDoMenu("/logistica/caronas")).toBe("Voos");
    expect(itemAtivoDoMenu("/logistica/hospedagem")).toBe("Hospedagem");
    expect(itemAtivoDoMenu("/logistica/creditos")).toBe("Hospedagem");
    // /logistica só redireciona para /logistica/voos.
    expect(itemAtivoDoMenu("/logistica")).toBeNull();
  });

  it("cada tela da logística pertence a um item do menu (nenhuma fica sem dono)", () => {
    const donos = ["voos", "caronas", "hospedagem", "creditos"].map((tela) => itemAtivoDoMenu(`/logistica/${tela}`));
    expect(donos).toEqual(["Voos", "Voos", "Hospedagem", "Hospedagem"]);
    expect(ROTAS_DO_MENU.filter((rota) => rota.nome === "Voos" || rota.nome === "Hospedagem").map((rota) => rota.href)).toEqual(["/logistica/voos", "/logistica/hospedagem"]);
  });

  it("não confunde prefixo de palavra", () => {
    expect(itemAtivoDoMenu("/custosx")).toBeNull();
    expect(itemAtivoDoMenu("/")).toBeNull();
  });

  it("nas telas do evento acende a origem; o resumo acende Calendário", () => {
    const id = "/eventos/7e570000-0000-7000-8000-000000000001";
    expect(itemAtivoDoMenu(id)).toBe("Calendário");
    expect(itemAtivoDoMenu(`${id}/escala`)).toBe("Escalas");
    expect(itemAtivoDoMenu(`${id}/comunicacao`)).toBe("Comunicação");
    expect(itemAtivoDoMenu(`${id}/logistica`)).toBe("Voos");
    expect(itemAtivoDoMenu(`${id}/custos`)).toBe("Custos");
  });
});
