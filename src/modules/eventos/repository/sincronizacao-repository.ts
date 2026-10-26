import { and, eq, isNull, ne, sql } from "drizzle-orm";

import type { Db } from "@/core/db/database";
import { polo } from "@/core/db/schema/core";
import { evento, local, tipoEvento } from "@/core/db/schema/eventos";

import type { EventoDaTurma } from "../domain/turma";

export type AcaoSincronizacao = "CRIADO" | "ATUALIZADO" | "IGNORADO_EXCLUIDO";

export type EventoSalvo = {
  acao: AcaoSincronizacao;
  eventoId: string;
  /** Código que outro evento já usa; este ficou sem código até o time resolver. */
  codigoEmConflito: string | null;
  poloNaoEncontrado: boolean;
};

export type RepositorioSincronizacao = {
  tiposAtivos(): Promise<Map<string, { id: string; nome: string }>>;
  salvarEventoDaTurma(dados: EventoDaTurma, tipoEventoId: string, agora: Date): Promise<EventoSalvo>;
};

export function criarRepositorioSincronizacao(db: Db): RepositorioSincronizacao {
  return {
    async tiposAtivos() {
      const tipos = await db
        .select({ id: tipoEvento.id, sigla: tipoEvento.sigla, nome: tipoEvento.nome })
        .from(tipoEvento)
        .where(eq(tipoEvento.ativo, true));
      return new Map(tipos.map((tipo) => [tipo.sigla, { id: tipo.id, nome: tipo.nome }]));
    },

    salvarEventoDaTurma(dados, tipoEventoId, agora) {
      return db.transaction(async (tx) => {
        const [existente] = await tx
          .select({ id: evento.id, deletedAt: evento.deletedAt })
          .from(evento)
          .where(eq(evento.iamControlTurmaId, dados.iamControlTurmaId))
          .for("update");

        // Evento apagado pelo time no Eventos não volta pela sincronização.
        if (existente?.deletedAt) {
          return { acao: "IGNORADO_EXCLUIDO", eventoId: existente.id, codigoEmConflito: null, poloNaoEncontrado: false };
        }

        let poloId: string | null = null;
        if (dados.poloSigla) {
          const [encontrado] = await tx
            .select({ id: polo.id })
            .from(polo)
            .where(and(sql`upper(${polo.codigo}) = ${dados.poloSigla}`, isNull(polo.deletedAt)))
            .limit(1);
          poloId = encontrado?.id ?? null;
        }

        let localId: string | null = null;
        if (dados.local) {
          const [encontrado] = await tx
            .select({ id: local.id })
            .from(local)
            .where(
              and(
                eq(local.tipo, "EVENTO"),
                isNull(local.deletedAt),
                eq(local.uf, dados.local.uf),
                sql`lower(${local.nome}) = lower(${dados.local.nome})`,
                sql`lower(${local.cidade}) = lower(${dados.local.cidade})`,
              ),
            )
            .limit(1);
          localId =
            encontrado?.id ??
            (await tx.insert(local).values({ ...dados.local, tipo: "EVENTO" }).returning({ id: local.id }))[0]!.id;
        }

        let codigo = dados.codigo;
        let codigoEmConflito: string | null = null;
        if (codigo) {
          const [outro] = await tx
            .select({ id: evento.id })
            .from(evento)
            .where(
              and(
                eq(evento.codigo, codigo),
                existente ? ne(evento.id, existente.id) : sql`true`,
              ),
            )
            .limit(1);
          if (outro) {
            codigoEmConflito = codigo;
            codigo = null;
          }
        }

        // Campos que vêm do IAM Control. Expectativa de público e pessoas na fila são do time:
        // a sincronização só preenche a expectativa quando ainda está vazia.
        const campos = {
          nome: dados.nome,
          inicio: dados.inicio,
          fim: dados.fim,
          status: dados.status,
          tipoEventoId,
          codigo,
          edicao: dados.edicao,
          poloId,
          localId,
          sincronizadoEm: agora,
          atualizadoEm: agora,
        };

        if (existente) {
          await tx
            .update(evento)
            .set({
              ...campos,
              expectativaPublico: sql`coalesce(${evento.expectativaPublico}, ${dados.expectativaPublico})`,
            })
            .where(eq(evento.id, existente.id));
          return { acao: "ATUALIZADO", eventoId: existente.id, codigoEmConflito, poloNaoEncontrado: !!dados.poloSigla && !poloId };
        }

        const [criado] = await tx
          .insert(evento)
          .values({
            ...campos,
            iamControlTurmaId: dados.iamControlTurmaId,
            expectativaPublico: dados.expectativaPublico,
          })
          .returning({ id: evento.id });
        return { acao: "CRIADO", eventoId: criado!.id, codigoEmConflito, poloNaoEncontrado: !!dados.poloSigla && !poloId };
      });
    },
  };
}
