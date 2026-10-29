import { and, eq, isNull, sql } from "drizzle-orm";

import { polo } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { evento, local, tipoEvento } from "@/core/db/schema/eventos";

import type { StatusEscala } from "../domain/calendario";
import type { StatusEvento } from "../domain/turma";

// Dados do evento que o Resumo mostra e os que o time edita (expectativa de público e fila).

export type EventoDoResumo = {
  id: string;
  nome: string;
  codigo: string | null;
  edicao: string | null;
  iamControlTurmaId: number | null;
  tipoSigla: string | null;
  tipoNome: string | null;
  poloCodigo: string | null;
  poloNome: string | null;
  dataInicio: string;
  dataFim: string;
  local: { nome: string; cidade: string; uf: string } | null;
  status: StatusEvento;
  statusEscala: StatusEscala;
  expectativaPublico: number | null;
  pessoasNaFila: number | null;
  aprovadoEm: Date | null;
  sincronizadoEm: Date | null;
  /** Versão para o compare-and-set, com microssegundos (o Date do JS perderia a precisão). */
  atualizadoEm: string;
};

const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

const versao = sql<string>`to_char(${evento.atualizadoEm} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export function criarRepositorioEvento(executor: Executor) {
  return {
    async dadosDoEvento(eventoId: string): Promise<EventoDoResumo | null> {
      const [linha] = await executor
        .select({
          id: evento.id,
          nome: evento.nome,
          codigo: evento.codigo,
          edicao: evento.edicao,
          iamControlTurmaId: evento.iamControlTurmaId,
          tipoSigla: tipoEvento.sigla,
          tipoNome: tipoEvento.nome,
          poloCodigo: polo.codigo,
          poloNome: polo.nome,
          dataInicio: diaEmSaoPaulo(evento.inicio),
          dataFim: diaEmSaoPaulo(evento.fim),
          localNome: local.nome,
          localCidade: local.cidade,
          localUf: local.uf,
          status: evento.status,
          statusEscala: evento.statusEscala,
          expectativaPublico: evento.expectativaPublico,
          pessoasNaFila: evento.pessoasNaFila,
          aprovadoEm: evento.aprovadoEm,
          sincronizadoEm: evento.sincronizadoEm,
          atualizadoEm: versao,
        })
        .from(evento)
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .leftJoin(polo, eq(polo.id, evento.poloId))
        .leftJoin(local, eq(local.id, evento.localId))
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      if (!linha) return null;
      const { localNome, localCidade, localUf, ...resto } = linha;
      return {
        ...resto,
        // status e status_escala têm CHECK no banco com esses valores.
        status: resto.status as StatusEvento,
        statusEscala: resto.statusEscala as StatusEscala,
        local: localNome !== null && localCidade !== null && localUf !== null ? { nome: localNome, cidade: localCidade, uf: localUf } : null,
      };
    },

    /** Compare-and-set em atualizado_em. false = o evento mudou (ou sumiu) desde a leitura. */
    async atualizarDadosDoEvento(
      eventoId: string,
      dados: { expectativaPublico: number | null; pessoasNaFila: number | null },
      { versaoEsperada, instante }: { versaoEsperada: string; instante: Date },
    ): Promise<boolean> {
      const alterados = await executor
        .update(evento)
        .set({ expectativaPublico: dados.expectativaPublico, pessoasNaFila: dados.pessoasNaFila, atualizadoEm: instante })
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt), sql`${evento.atualizadoEm} = ${versaoEsperada}::timestamptz`))
        .returning({ id: evento.id });
      return alterados.length === 1;
    },

    async registrarDadosAlterados(
      eventoId: string,
      { de, para, usuarioId }: { de: Record<string, number | null>; para: Record<string, number | null>; usuarioId: string },
    ): Promise<void> {
      await registrarAcao(executor, { entidade: "EVENTO", entidadeId: eventoId, eventoId, acao: "DADOS_DO_EVENTO_ALTERADOS", usuarioId, dados: { de, para } });
    },
  };
}

export type RepositorioEvento = ReturnType<typeof criarRepositorioEvento>;
