import { describe, expect, it, vi } from "vitest";

import { ConvocacaoInativaError, ConvocacaoNaoEncontradaError, EscalaMudouError, EventoNaoEncontradoError } from "../../domain/convite";
import { concluirComunicacao, registrarConvite, type RepositorioConvite } from "../convite";

const INSTANTE = new Date("2026-11-05T12:00:00Z");

function repositorio(dados: Partial<RepositorioConvite> = {}): RepositorioConvite {
  return {
    travarConvocacao: vi.fn(async () => "SUGERIDA" as const),
    marcarConvidada: vi.fn(async () => true),
    travarComunicacaoDoEvento: vi.fn(async () => ({ statusEscala: "APROVADA" as const, equipe: { ativas: 2, semEnvio: 0 } })),
    marcarComunicada: vi.fn(async () => true),
    ...dados,
  };
}

describe("registrarConvite", () => {
  it("convida a sugerida e não regrava quem já foi convidado", async () => {
    const repo = repositorio();
    await expect(registrarConvite(repo, { convocacaoId: "c1", instante: INSTANTE })).resolves.toBe("CONVIDADA");
    expect(repo.marcarConvidada).toHaveBeenCalledWith("c1", INSTANTE);

    const jaConvidada = repositorio({ travarConvocacao: async () => "ACEITA" });
    await expect(registrarConvite(jaConvidada, { convocacaoId: "c1", instante: INSTANTE })).resolves.toBe("SEM_MUDANCA");
    expect(jaConvidada.marcarConvidada).not.toHaveBeenCalled();
  });

  it("recusa convocação inativa ou inexistente e acusa a corrida perdida", async () => {
    await expect(registrarConvite(repositorio({ travarConvocacao: async () => "CANCELADA" }), { convocacaoId: "c1", instante: INSTANTE })).rejects.toBeInstanceOf(ConvocacaoInativaError);
    await expect(registrarConvite(repositorio({ travarConvocacao: async () => null }), { convocacaoId: "c1", instante: INSTANTE })).rejects.toBeInstanceOf(ConvocacaoNaoEncontradaError);
    await expect(registrarConvite(repositorio({ marcarConvidada: async () => false }), { convocacaoId: "c1", instante: INSTANTE })).rejects.toBeInstanceOf(EscalaMudouError);
  });
});

describe("concluirComunicacao", () => {
  const pedido = { eventoId: "e1", usuarioId: "u1", instante: INSTANTE };

  it("comunica quando toda a equipe ativa recebeu a copy, com o registro", async () => {
    const repo = repositorio();
    await expect(concluirComunicacao(repo, pedido)).resolves.toBe("COMUNICADA");
    expect(repo.marcarComunicada).toHaveBeenCalledWith("e1", { usuarioId: "u1", instante: INSTANTE, equipe: { ativas: 2, semEnvio: 0 } });
  });

  it("falta copy ou já comunicada: nada muda", async () => {
    const faltando = repositorio({ travarComunicacaoDoEvento: async () => ({ statusEscala: "APROVADA", equipe: { ativas: 2, semEnvio: 1 } }) });
    await expect(concluirComunicacao(faltando, pedido)).resolves.toBe("SEM_MUDANCA");
    expect(faltando.marcarComunicada).not.toHaveBeenCalled();
    const comunicada = repositorio({ travarComunicacaoDoEvento: async () => ({ statusEscala: "COMUNICADA", equipe: { ativas: 2, semEnvio: 0 } }) });
    await expect(concluirComunicacao(comunicada, pedido)).resolves.toBe("SEM_MUDANCA");
  });

  it("evento inexistente e corrida perdida são erro", async () => {
    await expect(concluirComunicacao(repositorio({ travarComunicacaoDoEvento: async () => null }), pedido)).rejects.toBeInstanceOf(EventoNaoEncontradoError);
    await expect(concluirComunicacao(repositorio({ marcarComunicada: async () => false }), pedido)).rejects.toBeInstanceOf(EscalaMudouError);
  });
});
