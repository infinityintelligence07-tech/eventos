import { sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { type AutoriaDoRegistro, registrarAcao } from "@/core/db/registro-acao";

import { type AlvoDoAcesso, type NivelDeAcesso, nivelDosPerfis, type PessoaComAcesso, perfisDoNivel } from "../domain/acesso";

// Lê core.usuario, core.pessoa e core.usuario_perfil (do GH) e escreve os perfis do Eventos só pela função
// eventos.definir_perfis_do_eventos (migration 0012). O app não tem INSERT nem DELETE em core.usuario_perfil.

type Linha = { usuario_id: string; nome: string; email: string | null; ativo: boolean; perfis: string[] };

const NOME = sql`coalesce(
  (select coalesce(nullif(trim(p.nome_social), ''), p.nome_completo) from core.pessoa p
    where p.usuario_id = u.id and p.deleted_at is null order by p.ativo desc limit 1),
  nullif(trim(u.nome_usuario), ''), u.email, 'Sem nome')`;

const PERFIS = sql`coalesce((
  select array_agg(pf.codigo order by pf.codigo)
    from core.usuario_perfil up join core.perfil pf on pf.id = up.perfil_id
   where up.usuario_id = u.id and up.escopo = 'GLOBAL' and pf.codigo in ('EVENTOS_TIME', 'EVENTOS_LIDER')), '{}')`;

const paraPessoa = (linha: Linha): PessoaComAcesso => ({
  usuarioId: linha.usuario_id,
  nome: linha.nome,
  email: linha.email,
  ativo: linha.ativo,
  nivel: nivelDosPerfis(linha.perfis),
});

/** Curinga do ILIKE sem deixar % e _ digitados virarem padrão. */
const contem = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function criarRepositorioAcesso(executor: Executor) {
  return {
    /** Quem tem perfil do Eventos hoje, inclusive contas que ficaram inativas (para a líder retirar). */
    async comAcesso(): Promise<PessoaComAcesso[]> {
      const linhas = await executor.execute<Linha>(sql`
        select * from (
          select u.id as usuario_id, ${NOME} as nome, u.email, (u.ativo and u.deleted_at is null) as ativo, ${PERFIS} as perfis
            from core.usuario u
        ) usuarios
        where cardinality(perfis) > 0
        order by (perfis @> array['EVENTOS_LIDER']) desc, lower(nome)`);
      return linhas.rows.map(paraPessoa);
    },

    /** Contas ativas ainda sem acesso, por nome ou e-mail. */
    async semAcesso(busca: string, limite: number): Promise<PessoaComAcesso[]> {
      const padrao = contem(busca);
      const linhas = await executor.execute<Linha>(sql`
        select * from (
          select u.id as usuario_id, ${NOME} as nome, u.email, true as ativo, ${PERFIS} as perfis
            from core.usuario u
           where u.ativo and u.deleted_at is null and u.email is not null
        ) usuarios
        where cardinality(perfis) = 0 and (nome ilike ${padrao} or email ilike ${padrao})
        order by lower(nome)
        limit ${limite}`);
      return linhas.rows.map(paraPessoa);
    },

    async alvo(usuarioId: string): Promise<AlvoDoAcesso | null> {
      const linhas = await executor.execute<{ ativo: boolean; perfis: string[] }>(sql`
        select (u.ativo and u.deleted_at is null) as ativo, ${PERFIS} as perfis from core.usuario u where u.id = ${usuarioId}`);
      const linha = linhas.rows[0];
      return linha ? { usuarioId, ativo: linha.ativo, nivel: nivelDosPerfis(linha.perfis) } : null;
    },

    /** Troca os perfis do Eventos do usuário e devolve o nível que ele tinha (lido dentro da função, com trava). */
    async definir(atorUsuarioId: string, usuarioId: string, nivel: NivelDeAcesso): Promise<NivelDeAcesso> {
      const perfis = sql.join(
        perfisDoNivel(nivel).map((perfil) => sql`${perfil}`),
        sql`, `,
      );
      const linhas = await executor.execute<{ anteriores: string[] }>(sql`
        select eventos.definir_perfis_do_eventos(${atorUsuarioId}::uuid, ${usuarioId}::uuid, array[${perfis}]::text[]) as anteriores`);
      return nivelDosPerfis(linhas.rows[0]?.anteriores ?? []);
    },

    async registrar(usuarioId: string, entrada: AutoriaDoRegistro & { acao: string; dados: Record<string, unknown> }) {
      await registrarAcao(executor, { entidade: "CONFIGURACAO", entidadeId: usuarioId, ...entrada });
    },
  };
}
