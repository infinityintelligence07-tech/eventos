import { sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { logger } from "@/core/logging";

// Ator (docs/09 §3): usuário do Supabase → core.usuario ativo (por e-mail) → perfis do Eventos em core.usuario_perfil.
// Lido do banco a cada requisição: tirar o perfil ou desativar o usuário corta o acesso no próximo clique.

export type PerfilDoEventos = "EVENTOS_TIME" | "EVENTOS_LIDER";

export const PERFIS_DO_EVENTOS: readonly PerfilDoEventos[] = ["EVENTOS_TIME", "EVENTOS_LIDER"];

export type OrigemDoAtor = "SESSAO" | "LOCAL";

export type Ator = {
  /** core.usuario.id */
  usuarioId: string;
  /** core.pessoa.id com usuario_id = usuarioId. */
  pessoaId: string | null;
  /** Nome social ou completo da pessoa; senão nome_usuario; senão o e-mail. */
  nome: string;
  email: string;
  /** Só os do Eventos, só escopo GLOBAL. */
  perfis: readonly PerfilDoEventos[];
  origem: OrigemDoAtor;
};

export type ResolucaoDoAtor = { situacao: "OK"; ator: Ator } | { situacao: "SEM_CADASTRO" } | { situacao: "SEM_PERFIL"; email: string };

export function rotuloDoPerfil(perfil: PerfilDoEventos): string {
  switch (perfil) {
    case "EVENTOS_TIME":
      return "Time de eventos";
    case "EVENTOS_LIDER":
      return "Líder do time";
    default: {
      const desconhecido: never = perfil;
      throw new Error(`perfil desconhecido: ${String(desconhecido)}`);
    }
  }
}

function perfilDoEventos(codigo: string): PerfilDoEventos | null {
  return PERFIS_DO_EVENTOS.find((perfil) => perfil === codigo) ?? null;
}

/** O que o banco devolve para um usuário (nulo = não existe). */
export type CadastroDoUsuario = {
  usuario: { id: string; email: string | null; nomeUsuario: string | null; ativo: boolean; apagado: boolean };
  pessoa: { id: string; nome: string } | null;
  atribuicoes: { codigo: string; escopo: string }[];
};

export type PerfilIgnorado = { codigo: PerfilDoEventos; escopo: string };

/**
 * Decisão pura (docs/09 §3.2): sem usuário ativo → SEM_CADASTRO (sai da sessão); sem perfil GLOBAL do Eventos →
 * SEM_PERFIL (/sem-acesso). Perfil do Eventos com escopo diferente de GLOBAL não dá acesso (fail-closed).
 */
export function decidirAcesso(
  cadastro: CadastroDoUsuario | null,
  origem: OrigemDoAtor,
): { resolucao: ResolucaoDoAtor; ignorados: PerfilIgnorado[] } {
  if (!cadastro || !cadastro.usuario.ativo || cadastro.usuario.apagado || !cadastro.usuario.email) {
    return { resolucao: { situacao: "SEM_CADASTRO" }, ignorados: [] };
  }
  const { usuario, pessoa } = cadastro;
  const email = usuario.email!;

  const perfis = new Set<PerfilDoEventos>();
  const ignorados: PerfilIgnorado[] = [];
  for (const { codigo, escopo } of cadastro.atribuicoes) {
    const perfil = perfilDoEventos(codigo);
    if (!perfil) continue;
    if (escopo === "GLOBAL") perfis.add(perfil);
    else ignorados.push({ codigo: perfil, escopo });
  }
  if (perfis.size === 0) return { resolucao: { situacao: "SEM_PERFIL", email }, ignorados };

  return {
    resolucao: {
      situacao: "OK",
      ator: {
        usuarioId: usuario.id,
        pessoaId: pessoa?.id ?? null,
        nome: pessoa?.nome || usuario.nomeUsuario || email,
        email,
        perfis: PERFIS_DO_EVENTOS.filter((perfil) => perfis.has(perfil)),
        origem,
      },
    },
    ignorados,
  };
}

// core.perfil e core.usuario_perfil são do GH e ainda não estão em schema/core.ts: leitura com SQL direto.
type LinhaDoUsuario = { id: string; email: string | null; nome_usuario: string | null; ativo: boolean; apagado: boolean };

async function cadastroDoUsuario(executor: Executor, usuario: LinhaDoUsuario | undefined): Promise<CadastroDoUsuario | null> {
  if (!usuario) return null;
  const [pessoas, atribuicoes] = await Promise.all([
    executor.execute<{ id: string; nome: string }>(sql`
      select p.id, coalesce(nullif(trim(p.nome_social), ''), p.nome_completo) as nome
        from core.pessoa p
       where p.usuario_id = ${usuario.id} and p.deleted_at is null
       order by p.ativo desc
       limit 1`),
    executor.execute<{ codigo: string; escopo: string }>(sql`
      select pf.codigo, up.escopo
        from core.usuario_perfil up
        join core.perfil pf on pf.id = up.perfil_id
       where up.usuario_id = ${usuario.id}`),
  ]);
  return {
    usuario: { id: usuario.id, email: usuario.email, nomeUsuario: usuario.nome_usuario, ativo: usuario.ativo, apagado: usuario.apagado },
    pessoa: pessoas.rows[0] ?? null,
    atribuicoes: atribuicoes.rows,
  };
}

function registrarIgnorados(usuarioId: string | undefined, ignorados: PerfilIgnorado[]): void {
  if (ignorados.length > 0) {
    logger.warn({ usuarioId, ignorados }, "perfil do Eventos com escopo diferente de GLOBAL ignorado");
  }
}

const COLUNAS_DO_USUARIO = sql`id, email, nome_usuario, ativo, deleted_at is not null as apagado`;

/** Login real: e-mail (já confirmado pelo provedor) comparado em minúsculas com core.usuario.email. */
export async function resolverAtorPorEmail(email: string, executor: Executor): Promise<ResolucaoDoAtor> {
  const normalizado = email.trim().toLowerCase();
  if (!normalizado) return { situacao: "SEM_CADASTRO" };
  // Mais de um usuário com o mesmo e-mail: prefere o ativo e não apagado.
  const usuarios = await executor.execute<LinhaDoUsuario>(sql`
    select ${COLUNAS_DO_USUARIO} from core.usuario
     where lower(email) = ${normalizado}
     order by ativo desc, (deleted_at is null) desc
     limit 1`);
  const usuario = usuarios.rows[0];
  const { resolucao, ignorados } = decidirAcesso(await cadastroDoUsuario(executor, usuario), "SESSAO");
  registrarIgnorados(usuario?.id, ignorados);
  return resolucao;
}

/** Modo local ("Entrar como"): o id vem do cookie eventos_ator_local; mesmas regras do login real. */
export async function resolverAtorPorId(usuarioId: string, executor: Executor): Promise<ResolucaoDoAtor> {
  const usuarios = await executor.execute<LinhaDoUsuario>(sql`select ${COLUNAS_DO_USUARIO} from core.usuario where id = ${usuarioId}`);
  const usuario = usuarios.rows[0];
  const { resolucao, ignorados } = decidirAcesso(await cadastroDoUsuario(executor, usuario), "LOCAL");
  registrarIgnorados(usuario?.id, ignorados);
  return resolucao;
}

export type UsuarioLocal = { usuarioId: string; nome: string; email: string; perfis: PerfilDoEventos[] };

/** Usuários ativos do banco local para o seletor "Entrar como" (com e sem perfil do Eventos). */
export async function listarUsuariosLocais(executor: Executor): Promise<UsuarioLocal[]> {
  const linhas = await executor.execute<{ usuario_id: string; nome: string; email: string; perfis: string[] }>(sql`
    select * from (
    select u.id as usuario_id,
           coalesce(
             (select coalesce(nullif(trim(p.nome_social), ''), p.nome_completo)
                from core.pessoa p where p.usuario_id = u.id and p.deleted_at is null limit 1),
             u.nome_usuario, u.email) as nome,
           u.email,
           coalesce(array_agg(pf.codigo order by pf.codigo) filter (where up.escopo = 'GLOBAL' and pf.codigo in ('EVENTOS_TIME', 'EVENTOS_LIDER')), '{}') as perfis
      from core.usuario u
      left join core.usuario_perfil up on up.usuario_id = u.id
      left join core.perfil pf on pf.id = up.perfil_id
     where u.ativo and u.deleted_at is null and u.email is not null
     group by u.id
    ) usuarios
    order by cardinality(perfis) = 0, lower(nome)`);
  return linhas.rows.map((linha) => ({
    usuarioId: linha.usuario_id,
    nome: linha.nome,
    email: linha.email,
    perfis: linha.perfis.flatMap((codigo) => perfilDoEventos(codigo) ?? []),
  }));
}
