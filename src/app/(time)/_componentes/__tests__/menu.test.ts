import { describe, expect, it } from "vitest";

import { itemAtivoDoMenu } from "../menu";

describe("item ativo do menu", () => {
  it("acende pela rota e pelas subrotas", () => {
    expect(itemAtivoDoMenu("/calendario")).toBe("Calendário");
    expect(itemAtivoDoMenu("/escalas/aprovacao")).toBe("Escalas");
    expect(itemAtivoDoMenu("/logistica/hospedagem")).toBe("Logística e SDC");
    expect(itemAtivoDoMenu("/configuracoes/vagas")).toBe("Configurações");
    expect(itemAtivoDoMenu("/disponibilidade/nova")).toBe("Disponibilidade");
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
    expect(itemAtivoDoMenu(`${id}/logistica`)).toBe("Logística e SDC");
    expect(itemAtivoDoMenu(`${id}/custos`)).toBe("Custos");
  });
});
