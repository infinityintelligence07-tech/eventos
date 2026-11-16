import { and, eq, isNull, ne, sql } from "drizzle-orm";

import type { Db } from "@/core/db/database";
import { polo } from "@/core/db/schema/core";
import { evento, local, tipoEvento } from "@/core/db/schema/eventos";

import type { EventoDaTurma } from "../domain/turma";

/** SEM_MUDANCA: a turma chegou igual ao que o evento já tinha; só a hora da sincronização foi anotada. */
export type AcaoSincronizacao = "CRIADO" | "ATUALIZADO" | "SEM_MUDANCA" | "IGNORADO_EXCLUIDO";

export type EventoSalvo = {
  acao: AcaoSincronizacao;
  eventoId: string;
  /** Código que outro evento ativo já usa; este ficou sem código até o time resolver. */
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
          .select({
            id: evento.id,
            deletedAt: evento.deletedAt,
            nome: evento.nome,
            inicio: evento.inicio,
            fim: evento.fim,
            status: evento.status,
            tipoEventoId: evento.tipoEventoId,
            codigo: evento.codigo,
            edicao: evento.edicao,
            poloId: evento.poloId,
            localId: evento.localId,
            expectativaPublico: evento.expectativaPublico,
            alunosConfirmados: evento.alunosConfirmados,
          })
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

        // Turma remarcada: a cancelada e a nova têm a mesma edição. O código fica com o evento ativo;
        // só dois eventos ativos com o mesmo código viram conflito para o time resolver.
        let codigo = dados.codigo;
        let codigoEmConflito: string | null = null;
        if (codigo) {
          const [outro] = await tx
            .select({ id: evento.id, status: evento.status, deletedAt: evento.deletedAt })
            .from(evento)
            .where(
              and(
                eq(evento.codigo, codigo),
                existente ? ne(evento.id, existente.id) : sql`true`,
              ),
            )
            .limit(1)
            .for("update");
          if (outro) {
            const esteAtivo = dados.status !== "CANCELADO";
            const outroAtivo = outro.status !== "CANCELADO" && !outro.deletedAt;
            if (esteAtivo && !outroAtivo) {
              await tx.update(evento).set({ codigo: null, atualizadoEm: agora }).where(eq(evento.id, outro.id));
            } else {
              if (esteAtivo) codigoEmConflito = codigo;
              codigo = null;
            }
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
        };

        if (existente) {
          // atualizado_em é a versão que a tela usa para detectar edição simultânea (Público e fila). A sincronização
          // roda a cada 30 minutos: se renovasse a versão sempre, quem estivesse com a tela aberta perderia o que
          // digitou sem ninguém ter mexido. Só renova quando um dado do evento mudou de verdade.
          const mudou =
            existente.nome !== campos.nome ||
            existente.inicio.getTime() !== campos.inicio.getTime() ||
            existente.fim.getTime() !== campos.fim.getTime() ||
            existente.status !== campos.status ||
            existente.tipoEventoId !== campos.tipoEventoId ||
            existente.codigo !== campos.codigo ||
            existente.edicao !== campos.edicao ||
            existente.poloId !== campos.poloId ||
            existente.localId !== campos.localId ||
            (existente.expectativaPublico === null && dados.expectativaPublico !== null);
          // Os confirmados mudam a toda hora na semana do evento e são só informativos: gravam sem renovar a versão.
          const confirmadosMudaram = existente.alunosConfirmados !== dados.alunosConfirmados;

          await tx
            .update(evento)
            .set(
              mudou
                ? {
                    ...campos,
                    alunosConfirmados: dados.alunosConfirmados,
                    expectativaPublico: sql`coalesce(${evento.expectativaPublico}, ${dados.expectativaPublico})`,
                    sincronizadoEm: agora,
                    atualizadoEm: agora,
                  }
                : { alunosConfirmados: dados.alunosConfirmados, sincronizadoEm: agora },
            )
            .where(eq(evento.id, existente.id));
          return {
            acao: mudou || confirmadosMudaram ? "ATUALIZADO" : "SEM_MUDANCA",
            eventoId: existente.id,
            codigoEmConflito,
            poloNaoEncontrado: !!dados.poloSigla && !poloId,
          };
        }

        const [criado] = await tx
          .insert(evento)
          .values({
            ...campos,
            alunosConfirmados: dados.alunosConfirmados,
            sincronizadoEm: agora,
            atualizadoEm: agora,
            iamControlTurmaId: dados.iamControlTurmaId,
            expectativaPublico: dados.expectativaPublico,
          })
          .returning({ id: evento.id });
        return { acao: "CRIADO", eventoId: criado!.id, codigoEmConflito, poloNaoEncontrado: !!dados.poloSigla && !poloId };
      });
    },
  };
}
