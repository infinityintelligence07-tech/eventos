import { describe, expect, it, vi } from "vitest";

import type { RepositorioVagas } from "@/modules/escala";
import type { EventoDaTurma, RepositorioSincronizacao } from "@/modules/eventos";
import { turmaDeExemplo } from "@/test/turmas";

import { hojeEmSaoPaulo, sincronizarTurmas } from "../sincronizar-turmas";

const tipos = new Map([
  ["CONF", { id: "tipo-conf", nome: "Confronto" }],
  ["ASM", { id: "tipo-asm", nome: "ASM" }],
]);

function dependencias(turmas = [turmaDeExemplo()]) {
  const salvos: EventoDaTurma[] = [];
  const eventos: RepositorioSincronizacao = {
    tiposAtivos: async () => tipos,
    salvarEventoDaTurma: vi.fn(async (dados: EventoDaTurma) => {
      salvos.push(dados);
      if (dados.iamControlTurmaId === 999) throw new Error("falhou no banco");
      return {
        acao: dados.iamControlTurmaId === 502 ? "ATUALIZADO" : "CRIADO",
        eventoId: `ev-${dados.iamControlTurmaId}`,
        codigoEmConflito: dados.iamControlTurmaId === 502 ? dados.codigo : null,
        poloNaoEncontrado: true,
      } as const;
    }),
  };
  const vagas: RepositorioVagas = {
    comEventoTravado: async (_id, trabalho) => trabalho(null),
  };
  return {
    deps: {
      iamControl: { listarTurmas: async () => ({ a_partir_de: "2026-09-26", ate: null, total: turmas.length, turmas }) },
      eventos,
      vagas,
      agora: new Date("2026-10-26T15:00:00Z"),
    },
    salvos,
  };
}

describe("sincronizar turmas", () => {
  it("cria, atualiza, ignora e não para por uma falha", async () => {
    const { deps, salvos } = dependencias([
      turmaDeExemplo(),
      turmaDeExemplo({ id: 502, edicao: "61" }),
      turmaDeExemplo({ id: 503, treinamento: { id: 1, nome: "Mentoria", sigla: null, tipo_evento: false, tipo_palestra: false } }),
      turmaDeExemplo({ id: 504, treinamento: { id: 2, nome: "Missão Governar", sigla: "MG", tipo_evento: true, tipo_palestra: false } }),
      turmaDeExemplo({ id: 999 }),
    ]);

    const resumo = await sincronizarTurmas(deps);

    expect(resumo).toMatchObject({
      turmasLidas: 5,
      criados: 1,
      atualizados: 1,
      ignoradas: [
        { iamControlTurmaId: 503, motivo: "TIPO_NAO_RECONHECIDO" },
        { iamControlTurmaId: 504, motivo: "TIPO_INATIVO" },
      ],
      codigosEmConflito: [{ iamControlTurmaId: 502, codigo: "CONF_AM_61" }],
      polosNaoEncontrados: ["AM"],
      falhas: [{ iamControlTurmaId: 999, erro: "falhou no banco" }],
    });
    expect(resumo.vagas.NAO_ENCONTRADO).toBe(2);
    expect(salvos[0]?.nome).toBe("Confronto · ed. 60 · Manaus");
  });

  it("hoje é a data de São Paulo, não a de UTC", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-27T02:30:00Z"))).toBe("2026-10-26");
  });
});
