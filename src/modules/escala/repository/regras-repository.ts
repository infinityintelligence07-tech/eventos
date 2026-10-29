import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { evento, tipoEvento } from "@/core/db/schema/eventos";

// tipo_evento.regra_vagas é do módulo escala (docs/07 §2.3); o resto do tipo é do módulo eventos.

export type TipoComRegra = { id: string; sigla: string; nome: string; regraVagas: unknown; atualizadoEm: Date };

export function criarRepositorioRegras(executor: Executor) {
  return {
    async tiposComRegra(): Promise<TipoComRegra[]> {
      return executor
        .select({ id: tipoEvento.id, sigla: tipoEvento.sigla, nome: tipoEvento.nome, regraVagas: tipoEvento.regraVagas, atualizadoEm: tipoEvento.atualizadoEm })
        .from(tipoEvento)
        .where(eq(tipoEvento.ativo, true))
        .orderBy(asc(tipoEvento.nome));
    },

    async travarTipo(tipoEventoId: string): Promise<TipoComRegra | null> {
      const [linha] = await executor
        .select({ id: tipoEvento.id, sigla: tipoEvento.sigla, nome: tipoEvento.nome, regraVagas: tipoEvento.regraVagas, atualizadoEm: tipoEvento.atualizadoEm })
        .from(tipoEvento)
        .where(eq(tipoEvento.id, tipoEventoId))
        .for("update");
      return linha ?? null;
    },

    /** Grava a regra e o histórico (registro_acao TIPO_EVENTO) na mesma transação, com a regra de antes e a de depois. */
    async gravarRegra(
      tipoEventoId: string,
      { antes, depois, usuarioId, instante }: { antes: unknown; depois: unknown; usuarioId: string; instante: Date },
    ): Promise<void> {
      await executor.update(tipoEvento).set({ regraVagas: depois, atualizadoEm: instante }).where(eq(tipoEvento.id, tipoEventoId));
      await registrarAcao(executor, {
        entidade: "TIPO_EVENTO",
        entidadeId: tipoEventoId,
        acao: "REGRA_VAGAS_ALTERADA",
        usuarioId,
        dados: { antes, depois },
      });
    },

    async registrarRecalculo(
      tipoEventoId: string,
      { eventos, alterados, usuarioId }: { eventos: number; alterados: number; usuarioId: string },
    ): Promise<void> {
      await registrarAcao(executor, { entidade: "TIPO_EVENTO", entidadeId: tipoEventoId, acao: "VAGAS_DO_TIPO_RECALCULADAS", usuarioId, dados: { eventos, alterados } });
    },

    /** Eventos do tipo que ainda não acabaram, com a escala em montagem. */
    async eventosParaRecalcular(tipoEventoId: string, agora: Date): Promise<string[]> {
      const linhas = await executor
        .select({ id: evento.id })
        .from(evento)
        .where(
          and(
            eq(evento.tipoEventoId, tipoEventoId),
            isNull(evento.deletedAt),
            inArray(evento.statusEscala, ["SEM_ESCALA", "RASCUNHO", "DEVOLVIDA"]),
            notInArray(evento.status, ["CANCELADO", "CONCLUIDO"]),
            sql`${evento.fim} >= ${agora}`,
          ),
        )
        .orderBy(asc(evento.inicio));
      return linhas.map((linha) => linha.id);
    },
  };
}

export type RepositorioRegras = ReturnType<typeof criarRepositorioRegras>;
