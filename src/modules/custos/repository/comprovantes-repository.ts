import { and, asc, eq, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { comprovanteCusto } from "@/core/db/schema/eventos";

import type { TipoDeComprovante } from "../domain/comprovantes";
import type { ComprovanteGravado, RepositorioComprovantes } from "../service/comprovantes";

const colunas = {
  id: comprovanteCusto.id,
  eventoId: comprovanteCusto.eventoId,
  pessoaId: comprovanteCusto.pessoaId,
  solicitacaoId: comprovanteCusto.solicitacaoId,
  chave: comprovanteCusto.chave,
  nome: comprovanteCusto.nomeOriginal,
  tipo: comprovanteCusto.tipo,
  tamanhoBytes: comprovanteCusto.tamanhoBytes,
  criadoEm: comprovanteCusto.criadoEm,
};

// tipo tem CHECK no banco com esses valores.
const ler = (linha: Omit<ComprovanteGravado, "tipo"> & { tipo: string }): ComprovanteGravado => ({ ...linha, tipo: linha.tipo as TipoDeComprovante });

const ordem = [asc(comprovanteCusto.criadoEm), asc(comprovanteCusto.id)];

/**
 * Uma transação por vez mexe nos anexos (e na solicitação) de uma pessoa num evento: sem isto, dois envios ao mesmo
 * tempo passariam do limite, e um anexo poderia entrar depois de a solicitação já ter sido enviada.
 */
export async function travarPessoaNoEvento(executor: Executor, eventoId: string, pessoaId: string): Promise<void> {
  await executor.execute(sql`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`eventos.comprovante_custo:${eventoId}:${pessoaId}`}, 0))`);
}

/** Os comprovantes de uma solicitação (para o time, no painel de auditoria). */
export async function comprovantesDaSolicitacao(executor: Executor, solicitacaoId: string): Promise<ComprovanteGravado[]> {
  return (await executor.select(colunas).from(comprovanteCusto).where(eq(comprovanteCusto.solicitacaoId, solicitacaoId)).orderBy(...ordem)).map(ler);
}

export async function contarComprovantes(executor: Executor, eventoId: string, pessoaId: string): Promise<number> {
  const [linha] = await executor
    .select({ quantidade: sql<number>`count(*)::int` })
    .from(comprovanteCusto)
    .where(and(eq(comprovanteCusto.eventoId, eventoId), eq(comprovanteCusto.pessoaId, pessoaId)));
  return linha?.quantidade ?? 0;
}

/** Os anexos que a pessoa enviou antes de a solicitação existir passam a ser dela. Devolve quantos a solicitação tem. */
export async function vincularComprovantes(executor: Executor, eventoId: string, pessoaId: string, solicitacaoId: string): Promise<number> {
  const vinculados = await executor
    .update(comprovanteCusto)
    .set({ solicitacaoId })
    .where(and(eq(comprovanteCusto.eventoId, eventoId), eq(comprovanteCusto.pessoaId, pessoaId)))
    .returning({ id: comprovanteCusto.id });
  return vinculados.length;
}

export function criarRepositorioComprovantes(executor: Executor): RepositorioComprovantes {
  return {
    travar: (eventoId, pessoaId) => travarPessoaNoEvento(executor, eventoId, pessoaId),

    async daPessoaNoEvento(eventoId, pessoaId) {
      return (
        await executor
          .select(colunas)
          .from(comprovanteCusto)
          .where(and(eq(comprovanteCusto.eventoId, eventoId), eq(comprovanteCusto.pessoaId, pessoaId)))
          .orderBy(...ordem)
      ).map(ler);
    },

    async buscar(comprovanteId) {
      const [linha] = await executor.select(colunas).from(comprovanteCusto).where(eq(comprovanteCusto.id, comprovanteId));
      return linha ? ler(linha) : null;
    },

    async inserir({ id, eventoId, pessoaId, solicitacaoId, chave, nome, tipo, tamanhoBytes, usuarioId, instante }) {
      const [linha] = await executor
        .insert(comprovanteCusto)
        .values({ id, eventoId, pessoaId, solicitacaoId, chave, nomeOriginal: nome, tipo, tamanhoBytes, enviadoPor: usuarioId, criadoEm: instante })
        .returning(colunas);
      return ler(linha!);
    },

    async apagar(comprovanteId) {
      await executor.delete(comprovanteCusto).where(eq(comprovanteCusto.id, comprovanteId));
    },

    async registrar({ comprovanteId, eventoId, acao, dados, usuarioId }) {
      await registrarAcao(executor, { entidade: "COMPROVANTE_CUSTO", entidadeId: comprovanteId, eventoId, acao, usuarioId, dados });
    },
  };
}
