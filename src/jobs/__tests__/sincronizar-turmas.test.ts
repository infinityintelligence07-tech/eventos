import { describe, expect, it, vi } from "vitest";

import type { RepositorioVagas } from "@/modules/escala";
import type { EventoDaTurma, LocalDaTurma, RepositorioSincronizacao } from "@/modules/eventos";
import { turmaDeExemplo } from "@/test/turmas";

import { hojeEmSaoPaulo, sincronizarTurmas } from "../sincronizar-turmas";

const tipos = new Map([
  ["CONF", { id: "tipo-conf", nome: "Confronto" }],
  ["ASM", { id: "tipo-asm", nome: "ASM" }],
]);

function dependencias(turmas = [turmaDeExemplo()]) {
  const salvos: EventoDaTurma[] = [];
  const locais: LocalDaTurma[] = [];
  const locaisDosEventos: (string | null)[] = [];
  const eventos: RepositorioSincronizacao = {
    tiposAtivos: async () => tipos,
    salvarLocalDoIamControl: vi.fn(async (dados: LocalDaTurma) => {
      locais.push(dados);
      if (dados.nome === "Local Com Defeito") throw new Error("falhou no local");
      return { localId: `local-${locais.length}`, criado: locais.length === 1, vinculados: locais.length === 2 ? 1 : 0, atualizados: 0 };
    }),
    salvarEventoDaTurma: vi.fn(async (dados: EventoDaTurma, _tipo: string, _agora: Date, localId: string | null) => {
      salvos.push(dados);
      locaisDosEventos.push(localId);
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
    locais,
    locaisDosEventos,
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

  it("cada local do IAM Control é gravado uma vez por rodada e o evento recebe o cadastro dele", async () => {
    const hotel = { ...turmaDeExemplo().local, nome: "Hotel Atlântico" };
    const { deps, locais, locaisDosEventos } = dependencias([
      turmaDeExemplo(),
      // Mesmo local, escrito de outro jeito e com outro número: vale o da primeira turma.
      turmaDeExemplo({ id: 502, edicao: "61", local: { ...turmaDeExemplo().local, nome: "  centro de CONVENCOES  vasco vasques ", numero: "9" } }),
      turmaDeExemplo({ id: 503, edicao: "62", local: hotel }),
      turmaDeExemplo({ id: 504, edicao: "63", local: hotel, polo: null }),
      // Sem cidade nem polo não há local.
      turmaDeExemplo({ id: 505, edicao: "64", polo: null, local: { ...turmaDeExemplo().local, cidade: null, estado: null } }),
    ]);

    const resumo = await sincronizarTurmas(deps);

    expect(locais.map((local) => [local.nome, local.numero])).toEqual([
      ["Centro de Convenções Vasco Vasques", "5001"],
      ["Hotel Atlântico", "5001"],
    ]);
    expect(locaisDosEventos).toEqual(["local-1", "local-1", "local-2", "local-2", null]);
    expect(resumo.locais).toEqual({ criados: 1, vinculados: 1, atualizados: 0 });
  });

  it("local que falha derruba só as turmas dele", async () => {
    const { deps } = dependencias([
      turmaDeExemplo({ local: { ...turmaDeExemplo().local, nome: "Local Com Defeito" } }),
      turmaDeExemplo({ id: 502, edicao: "61", local: { ...turmaDeExemplo().local, nome: "Local Com Defeito" } }),
      turmaDeExemplo({ id: 503, edicao: "62" }),
    ]);

    const resumo = await sincronizarTurmas(deps);

    expect(resumo.falhas).toEqual([
      { iamControlTurmaId: 501, erro: "falhou no local" },
      { iamControlTurmaId: 502, erro: "falhou no local" },
    ]);
    expect(resumo).toMatchObject({ criados: 1, locais: { criados: 0, vinculados: 1, atualizados: 0 } });
  });

  it("hoje é a data de São Paulo, não a de UTC", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-27T02:30:00Z"))).toBe("2026-10-26");
  });
});
