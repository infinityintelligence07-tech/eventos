import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { convocacao, escala, evento, mensagem, modeloCopy } from "@/core/db/schema/eventos";

import type { StatusConvocacao, StatusEscala } from "../domain/convite";
import type { RepositorioConvite } from "../service/convite";

const ATIVAS: StatusConvocacao[] = ["SUGERIDA", "CONVIDADA", "ACEITA"];

/** Recebe o executor da transação do fluxo: convite, comunicação e mensagem gravam juntos ou nada. */
export function criarRepositorioConvite(executor: Executor): RepositorioConvite {
  return {
    async travarConvocacao(convocacaoId) {
      const [linha] = await executor
        .select({ status: convocacao.status })
        .from(convocacao)
        .where(eq(convocacao.id, convocacaoId))
        .for("update");
      // status tem CHECK no banco com esses valores.
      return linha ? (linha.status as StatusConvocacao) : null;
    },

    async marcarConvidada(convocacaoId, instante) {
      const alteradas = await executor
        .update(convocacao)
        .set({ status: "CONVIDADA", convidadaEm: instante, atualizadoEm: instante })
        .where(and(eq(convocacao.id, convocacaoId), eq(convocacao.status, "SUGERIDA")))
        .returning({ id: convocacao.id });
      return alteradas.length === 1;
    },

    async travarComunicacaoDoEvento(eventoId) {
      const [travado] = await executor
        .select({ statusEscala: evento.statusEscala })
        .from(evento)
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)))
        .for("update");
      if (!travado) return null;

      const enviadaDeEscalacao = sql`exists (
        select 1 from ${mensagem}
          join ${modeloCopy} on ${modeloCopy.id} = ${mensagem.modeloId}
         where ${mensagem.convocacaoId} = ${convocacao.id}
           and ${mensagem.status} = 'ENVIADA'
           and ${modeloCopy.tipo} = 'ESCALACAO'
      )`;
      const [contagem] = await executor
        .select({
          ativas: sql<number>`count(*)::int`,
          semEnvio: sql<number>`(count(*) filter (where not ${enviadaDeEscalacao}))::int`,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(and(eq(escala.eventoId, eventoId), isNull(escala.deletedAt), inArray(convocacao.status, ATIVAS)));

      return {
        statusEscala: travado.statusEscala as StatusEscala,
        equipe: { ativas: contagem?.ativas ?? 0, semEnvio: contagem?.semEnvio ?? 0 },
      };
    },

    async marcarComunicada(eventoId, { usuarioId, instante, equipe }) {
      const alterados = await executor
        .update(evento)
        .set({ statusEscala: "COMUNICADA", atualizadoEm: instante })
        .where(and(eq(evento.id, eventoId), eq(evento.statusEscala, "APROVADA")))
        .returning({ id: evento.id });
      if (alterados.length !== 1) return false;

      await registrarAcao(executor, {
        entidade: "ESCALA_DO_EVENTO",
        entidadeId: eventoId,
        eventoId,
        acao: "COMUNICADA",
        statusDe: "APROVADA",
        statusPara: "COMUNICADA",
        usuarioId,
        dados: { convocacoesAtivas: equipe.ativas },
      });
      return true;
    },
  };
}
