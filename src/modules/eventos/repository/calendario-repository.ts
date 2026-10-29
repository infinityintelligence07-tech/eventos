import { and, asc, eq, isNull, max, sql } from "drizzle-orm";

import type { Db } from "@/core/db/database";
import { polo } from "@/core/db/schema/core";
import { escala, evento, local, tipoEvento } from "@/core/db/schema/eventos";

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

/** O que o cabeçalho das telas do evento mostra (docs/08 §5). */
export type EventoDoCabecalho = EventoNoCalendario & {
  poloNome: string | null;
  local: { nome: string; cidade: string; uf: string } | null;
};

export type RepositorioCalendario = {
  eventosDoPeriodo(filtros: FiltrosDoPeriodo): Promise<EventoNoCalendario[]>;
  /** Nulo se não existe ou foi apagado. O id já deve ter formato de UUID. */
  eventoDoCabecalho(eventoId: string): Promise<EventoDoCabecalho | null>;
  opcoesDeFiltro(): Promise<OpcoesDeFiltro>;
  ultimaSincronizacao(): Promise<Date | null>;
};

const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

const dataInicio = diaEmSaoPaulo(evento.inicio);
const dataFim = diaEmSaoPaulo(evento.fim);

// Colunas explícitas: o Calendário também lê a produção, onde só existem as colunas até a migration 0003.
const COLUNAS_DO_EVENTO = {
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
};

// status e status_escala têm CHECK no banco com esses valores.
function comStatus<T extends { status: string; statusEscala: string }>(linha: T) {
  return { ...linha, status: linha.status as StatusEvento, statusEscala: linha.statusEscala as StatusEscala };
}

export function criarRepositorioCalendario(db: Db): RepositorioCalendario {
  return {
    async eventosDoPeriodo({ de, ate, poloCodigo, tipoSigla }) {
      const linhas = await db
        .select(COLUNAS_DO_EVENTO)
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
      return linhas.map(comStatus);
    },

    async eventoDoCabecalho(eventoId) {
      const [linha] = await db
        .select({
          ...COLUNAS_DO_EVENTO,
          poloNome: polo.nome,
          localNome: local.nome,
          localCidade: local.cidade,
          localUf: local.uf,
        })
        .from(evento)
        .innerJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .leftJoin(polo, eq(polo.id, evento.poloId))
        .leftJoin(local, eq(local.id, evento.localId))
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      if (!linha) return null;
      const { localNome, localCidade, localUf, ...resto } = linha;
      return {
        ...comStatus(resto),
        local: localNome !== null && localCidade !== null && localUf !== null ? { nome: localNome, cidade: localCidade, uf: localUf } : null,
      };
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
