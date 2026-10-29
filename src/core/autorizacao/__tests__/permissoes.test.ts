import { describe, expect, it } from "vitest";

import { AcessoNegadoError, exigirPermissao, PERMISSOES, type Permissao, type PerfilDoEventos, pode } from "..";

// Matriz da docs/09 §4.2 (com a §13.1: só a líder aprova e reabre; SoD-1 fora).
const MATRIZ: Record<Permissao, { time: boolean; lider: boolean }> = {
  "evento.editar": { time: true, lider: true },
  "escala.montar": { time: true, lider: true },
  "escala.registrar_resposta": { time: true, lider: true },
  "escala.aprovar": { time: false, lider: true },
  "escala.reabrir": { time: false, lider: true },
  "comunicacao.enviar": { time: true, lider: true },
  "disponibilidade.gerir": { time: true, lider: true },
  "disponibilidade.registrar_resposta": { time: true, lider: true },
  "pessoas.editar": { time: true, lider: true },
  "logistica.gerir": { time: true, lider: true },
  "logistica.registrar_retorno_sdc": { time: true, lider: true },
  "custos.registrar": { time: true, lider: true },
  "custos.auditar": { time: true, lider: true },
  "custos.reabrir_auditoria": { time: false, lider: true },
  "config.locais": { time: true, lider: true },
  "config.modelos_copy": { time: true, lider: true },
  "config.link_custos": { time: false, lider: true },
  "config.regras_vagas": { time: false, lider: true },
  "config.regras_custo": { time: false, lider: true },
};

const comPerfis = (...perfis: PerfilDoEventos[]) => ({ perfis });

describe("matriz perfil × permissão", () => {
  it("o catálogo é exatamente o da matriz", () => {
    expect([...PERMISSOES].sort()).toEqual(Object.keys(MATRIZ).sort());
  });

  it.each(Object.entries(MATRIZ) as [Permissao, { time: boolean; lider: boolean }][])("%s", (permissao, esperado) => {
    expect(pode(comPerfis("EVENTOS_TIME"), permissao)).toBe(esperado.time);
    expect(pode(comPerfis("EVENTOS_LIDER"), permissao)).toBe(esperado.lider);
    expect(pode(comPerfis("EVENTOS_TIME", "EVENTOS_LIDER"), permissao)).toBe(true);
    expect(pode(comPerfis(), permissao)).toBe(false);
  });

  it("perfil desconhecido não dá acesso (fail-closed)", () => {
    expect(pode({ perfis: ["COORD_EVENTOS" as PerfilDoEventos] }, "escala.montar")).toBe(false);
  });

  it("exigirPermissao lança AcessoNegadoError com a mensagem da tela", () => {
    expect(() => exigirPermissao(comPerfis("EVENTOS_TIME"), "escala.aprovar")).toThrow(AcessoNegadoError);
    expect(() => exigirPermissao(comPerfis("EVENTOS_TIME"), "escala.aprovar")).toThrow("Você não tem permissão para esta ação.");
    expect(() => exigirPermissao(comPerfis("EVENTOS_LIDER"), "escala.aprovar")).not.toThrow();
  });
});
