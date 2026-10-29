import { describe, expect, it, vi } from "vitest";

import { regrasVagasDaMigration } from "@/test/seeds";

import type { LinhaDaRegra } from "../../domain/plano-vagas";
import { type EventoParaVagas, gerarVagasDoEvento, type RepositorioVagas } from "../gerar-vagas";

const regras = regrasVagasDaMigration();

function repositorio(evento: EventoParaVagas | null, linhas: LinhaDaRegra[] = []) {
  const aplicar = vi.fn(async () => ({ funcoesNaoCadastradas: [] as string[] }));
  const repo: RepositorioVagas = {
    comEventoTravado: async (_id, trabalho) =>
      trabalho(evento ? { evento, linhasDaRegra: linhas, aplicar } : null),
  };
  return { repo, aplicar };
}

const confronto: EventoParaVagas = {
  id: "e1",
  status: "PLANEJADO",
  statusEscala: "SEM_ESCALA",
  regraVagas: regras.CONF,
  expectativaPublico: 300,
  pessoasNaFila: null,
};

describe("gerar vagas do evento", () => {
  it("gera as vagas da regra e deixa a fila pendente", async () => {
    const { repo, aplicar } = repositorio(confronto);
    const resultado = await gerarVagasDoEvento(repo, "e1");
    expect(resultado.situacao).toBe("GERADA");
    if (resultado.situacao !== "GERADA") return;
    expect(resultado.pendencias).toEqual([{ funcao: "PAI_MAE", variavel: "pessoas_na_fila" }]);
    expect(aplicar).toHaveBeenCalledOnce();
    expect(resultado.plano.inserir[0]).toEqual({ funcao: "LIDER", quantidade: 12 });
  });

  it("escala devolvida volta a receber vagas", async () => {
    const { repo, aplicar } = repositorio({ ...confronto, statusEscala: "DEVOLVIDA" });
    expect((await gerarVagasDoEvento(repo, "e1")).situacao).toBe("GERADA");
    expect(aplicar).toHaveBeenCalledOnce();
  });

  it("não toca em escala aprovada nem em evento encerrado", async () => {
    for (const [mudanca, situacao] of [
      [{ statusEscala: "APROVADA" }, "ESCALA_APROVADA"],
      [{ statusEscala: "COMUNICADA" }, "ESCALA_APROVADA"],
      [{ statusEscala: "AGUARDANDO_APROVACAO" }, "ESCALA_APROVADA"],
      [{ status: "CANCELADO" }, "EVENTO_ENCERRADO"],
      [{ status: "CONCLUIDO" }, "EVENTO_ENCERRADO"],
    ] as const) {
      const { repo, aplicar } = repositorio({ ...confronto, ...mudanca });
      expect((await gerarVagasDoEvento(repo, "e1")).situacao).toBe(situacao);
      expect(aplicar).not.toHaveBeenCalled();
    }
  });

  it("evento inexistente, regra inválida e nada a mudar", async () => {
    expect((await gerarVagasDoEvento(repositorio(null).repo, "x")).situacao).toBe("NAO_ENCONTRADO");

    const invalida = repositorio({ ...confronto, regraVagas: { funcoes: [{ funcao: "DJ", formula: "(" }] } });
    expect(await gerarVagasDoEvento(invalida.repo, "e1")).toMatchObject({ situacao: "REGRA_INVALIDA" });

    const semRegra = repositorio({ ...confronto, regraVagas: {} });
    expect((await gerarVagasDoEvento(semRegra.repo, "e1")).situacao).toBe("SEM_MUDANCA");
    expect(semRegra.aplicar).not.toHaveBeenCalled();
  });
});
