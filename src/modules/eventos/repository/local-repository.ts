import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { evento, hospedagem, local } from "@/core/db/schema/eventos";

import type { SalvarLocal, TipoDeLocal, UsoDoLocal } from "../domain/local";

// eventos.local: o time cadastra hotéis e apartamentos e corrige locais de evento (a sincronização cria os
// locais de evento novos). Arquivar = deleted_at; o local some das listas, mas eventos antigos continuam apontando.

export type DadosDoLocal = Omit<SalvarLocal, "localId">;

export type LocalCadastrado = DadosDoLocal & { id: string; uso: UsoDoLocal; atualizadoEm: Date };

// Nomes qualificados à mão: num select de uma tabela só o Drizzle escreve as colunas sem a tabela, e a subconsulta
// compararia a coluna dela mesma.
const usoEmEventos = sql<number>`(select count(*) from ${evento} e where e.local_id = "local"."id" and e.deleted_at is null)::int`;
const usoEmHospedagens = sql<number>`(select count(*) from ${hospedagem} h where h.local_id = "local"."id")::int`;

const COLUNAS = {
  id: local.id,
  nome: local.nome,
  tipo: local.tipo,
  cep: local.cep,
  logradouro: local.logradouro,
  numero: local.numero,
  complemento: local.complemento,
  bairro: local.bairro,
  cidade: local.cidade,
  uf: local.uf,
  lat: local.lat,
  lng: local.lng,
  capacidade: local.capacidade,
  atualizadoEm: local.atualizadoEm,
  eventos: usoEmEventos,
  hospedagens: usoEmHospedagens,
};

type Linha = { tipo: string; eventos: number; hospedagens: number } & Omit<LocalCadastrado, "tipo" | "uso">;

function comoLocal({ eventos, hospedagens, tipo, ...linha }: Linha): LocalCadastrado {
  // tipo tem CHECK no banco com os valores de TipoDeLocal.
  return { ...linha, tipo: tipo as TipoDeLocal, uso: { eventos, hospedagens } };
}

const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);

export function criarRepositorioLocal(executor: Executor) {
  return {
    async listar({ tipo, busca }: { tipo?: TipoDeLocal; busca?: string }): Promise<LocalCadastrado[]> {
      const padrao = busca ? `%${escaparLike(busca)}%` : null;
      const linhas = await executor
        .select(COLUNAS)
        .from(local)
        .where(
          and(
            isNull(local.deletedAt),
            tipo ? eq(local.tipo, tipo) : undefined,
            padrao ? or(sql`${local.nome} ilike ${padrao}`, sql`${local.cidade} ilike ${padrao}`) : undefined,
          ),
        )
        .orderBy(asc(local.uf), asc(local.cidade), asc(local.nome));
      return linhas.map(comoLocal);
    },

    async local(localId: string): Promise<LocalCadastrado | null> {
      const [linha] = await executor
        .select(COLUNAS)
        .from(local)
        .where(and(eq(local.id, localId), isNull(local.deletedAt)));
      return linha ? comoLocal(linha) : null;
    },

    /** Mesmo tipo, nome e cidade (sem diferenciar maiúsculas): a sincronização usa essa chave para achar o local de evento. */
    async existeComMesmoNome({ tipo, nome, cidade, uf }: Pick<DadosDoLocal, "tipo" | "nome" | "cidade" | "uf">, excetoId?: string): Promise<boolean> {
      const [linha] = await executor
        .select({ id: local.id })
        .from(local)
        .where(
          and(
            isNull(local.deletedAt),
            eq(local.tipo, tipo),
            eq(local.uf, uf),
            sql`lower(${local.nome}) = lower(${nome})`,
            sql`lower(${local.cidade}) = lower(${cidade})`,
            excetoId ? ne(local.id, excetoId) : undefined,
          ),
        )
        .limit(1);
      return linha !== undefined;
    },

    async criar(dados: DadosDoLocal, instante: Date): Promise<string> {
      const [criado] = await executor
        .insert(local)
        .values({ ...dados, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: local.id });
      return criado!.id;
    },

    /** false = não existe ou foi arquivado. */
    async alterar(localId: string, dados: DadosDoLocal, instante: Date): Promise<boolean> {
      const alterados = await executor
        .update(local)
        .set({ ...dados, atualizadoEm: instante })
        .where(and(eq(local.id, localId), isNull(local.deletedAt)))
        .returning({ id: local.id });
      return alterados.length === 1;
    },

    /** Trava o local (FOR UPDATE) e conta onde ele é usado. Nulo = não existe ou já foi arquivado. */
    async travarUso(localId: string): Promise<UsoDoLocal | null> {
      const [travado] = await executor
        .select({ id: local.id })
        .from(local)
        .where(and(eq(local.id, localId), isNull(local.deletedAt)))
        .for("update");
      if (!travado) return null;
      const [uso] = await executor.select({ eventos: usoEmEventos, hospedagens: usoEmHospedagens }).from(local).where(eq(local.id, localId));
      return uso ?? { eventos: 0, hospedagens: 0 };
    },

    async arquivar(localId: string, instante: Date): Promise<void> {
      await executor.update(local).set({ deletedAt: instante, atualizadoEm: instante }).where(eq(local.id, localId));
    },

    /** Endereço de local de evento ou hotel não é dado pessoal: as mudanças vão com os valores. */
    async registrar(
      localId: string,
      { acao, usuarioId, dados }: { acao: "LOCAL_CRIADO" | "LOCAL_ALTERADO" | "LOCAL_ARQUIVADO"; usuarioId: string; dados: Record<string, unknown> },
    ): Promise<void> {
      await registrarAcao(executor, { entidade: "LOCAL", entidadeId: localId, acao, usuarioId, dados });
    },
  };
}

export type RepositorioLocal = ReturnType<typeof criarRepositorioLocal>;
