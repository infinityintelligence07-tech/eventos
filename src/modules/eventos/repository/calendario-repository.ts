import { and, asc, eq, isNull, max, sql } from "drizzle-orm";

import type { Db } from "@/core/db/database";
import { polo } from "@/core/db/schema/core";
import { escala, evento, tipoEvento } from "@/core/db/schema/eventos";

import type { EventoNoCalendario, StatusEscala } from "../domain/calendario";
import type { StatusEvento } from "../domain/turma";

export type FiltrosDoPeriodo = {
  /** Primeiro e último dia (AAAA-MM-DD, São Paulo), inclusive. */
  de: string;
  ate: string;
  poloCodigo?: string;
  tipoSigla?: string;
};

export type OpcoesDeFiltro = {
  polos: { codigo: string; nome: string }[];
  tipos: { sigla: string; nome: string }[];
};

export type RepositorioCalendario = {
  eventosDoPeriodo(filtros: FiltrosDoPeriodo): Promise<EventoNoCalendario[]>;
  opcoesDeFiltro(): Promise<OpcoesDeFiltro>;
  ultimaSincronizacao(): Promise<Date | null>;
};

const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

export function criarRepositorioCalendario(db: Db): RepositorioCalendario {
  return {
    async eventosDoPeriodo({ de, ate, poloCodigo, tipoSigla }) {
      const dataInicio = diaEmSaoPaulo(evento.inicio);
      const dataFim = diaEmSaoPaulo(evento.fim);
      const linhas = await db
        .select({
          id: evento.id,
          nome: evento.nome,
          codigo: evento.codigo,
          edicao: evento.edicao,
          tipoSigla: tipoEvento.sigla,
          tipoNome: tipoEvento.nome,
          poloCodigo: polo.codigo,
          dataInicio,
          dataFim,
          status: evento.status,
          statusEscala: evento.statusEscala,
          expectativaPublico: evento.expectativaPublico,
          pessoasNaFila: evento.pessoasNaFila,
          vagas: sql<number>`coalesce((
            select sum(${escala.quantidadeVagas}) from ${escala}
             where ${escala.eventoId} = ${evento.id} and ${escala.deletedAt} is null
          ), 0)::int`,
        })
        .from(evento)
        .innerJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .leftJoin(polo, eq(polo.id, evento.poloId))
        .where(
          and(
            isNull(evento.deletedAt),
            sql`${dataInicio} <= ${ate}`,
            sql`${dataFim} >= ${de}`,
            poloCodigo ? eq(polo.codigo, poloCodigo) : undefined,
            tipoSigla ? eq(tipoEvento.sigla, tipoSigla) : undefined,
          ),
        )
        .orderBy(asc(evento.inicio), asc(evento.nome));

      // status e status_escala têm CHECK no banco com esses valores.
      return linhas.map((linha) => ({
        ...linha,
        status: linha.status as StatusEvento,
        statusEscala: linha.statusEscala as StatusEscala,
      }));
    },

    async opcoesDeFiltro() {
      const [polos, tipos] = await Promise.all([
        db
          .select({ codigo: polo.codigo, nome: polo.nome })
          .from(polo)
          .where(and(isNull(polo.deletedAt), eq(polo.ativo, true)))
          .orderBy(asc(polo.nome)),
        db
          .select({ sigla: tipoEvento.sigla, nome: tipoEvento.nome })
          .from(tipoEvento)
          .where(eq(tipoEvento.ativo, true))
          .orderBy(asc(tipoEvento.nome)),
      ]);
      return { polos, tipos };
    },

    async ultimaSincronizacao() {
      const [linha] = await db.select({ quando: max(evento.sincronizadoEm) }).from(evento);
      return linha?.quando ?? null;
    },
  };
}
