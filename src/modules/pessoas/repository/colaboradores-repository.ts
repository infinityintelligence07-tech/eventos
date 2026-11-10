import { sql } from "drizzle-orm";

import type { Db, Executor } from "@/core/db/database";

import type { PlanoDoColaborador } from "../domain/colaborador";

// Sincronização dos colaboradores do IAM Control (docs/10). Escreve em core.usuario e core.pessoa (tabelas do GH; o
// worker roda com o papel do dono) e em pessoa_evento/pessoa_funcao. Não dá perfil do Eventos: acesso de time é manual. Só acrescenta: perfil e função
// dados à mão nunca são retirados; quem saiu do IAM Control fica inativo (perde o login), sem apagar histórico.

export type AcaoDoColaborador = "CRIADO" | "ATUALIZADO" | "DESATIVADO" | "IGNORADO_INATIVO";

export type ColaboradorSalvo = { acao: AcaoDoColaborador; escalavel: boolean };

export type RepositorioColaboradores = {
  salvarColaborador(plano: PlanoDoColaborador, agora: Date): Promise<ColaboradorSalvo>;
};

async function uma<T extends Record<string, unknown>>(executor: Executor, consulta: ReturnType<typeof sql>): Promise<T | undefined> {
  return (await executor.execute<T>(consulta)).rows[0] as T | undefined;
}

async function salvarUsuario(tx: Executor, plano: PlanoDoColaborador, agora: Date) {
  const existente = await uma<{ id: string; ativo: boolean }>(
    tx,
    sql`select id, ativo from core.usuario where lower(trim(email)) = ${plano.email} and deleted_at is null for update`,
  );
  if (!existente) {
    if (!plano.ativo) return null;
    // nome_usuario fica vazio: é único no GH e colidiria entre homônimos. O nome do ator vem da pessoa.
    const criado = await uma<{ id: string }>(
      tx,
      sql`insert into core.usuario (email, telefone, ativo, criado_em, atualizado_em)
          values (${plano.email}, ${plano.telefone}, true, ${agora}, ${agora}) returning id`,
    );
    return { id: criado!.id, acao: "CRIADO" as const };
  }
  await tx.execute(sql`
    update core.usuario set telefone = coalesce(${plano.telefone}, telefone), ativo = ${plano.ativo}, atualizado_em = ${agora}
     where id = ${existente.id}`);
  return { id: existente.id, acao: existente.ativo && !plano.ativo ? ("DESATIVADO" as const) : ("ATUALIZADO" as const) };
}

async function salvarPessoa(tx: Executor, plano: PlanoDoColaborador, usuarioId: string, agora: Date) {
  const existente = await uma<{ id: string }>(
    tx,
    sql`select p.id from core.pessoa p
         where p.deleted_at is null
           and (exists (select 1 from eventos.pessoa_evento pe where pe.pessoa_id = p.id and pe.iam_control_user_id = ${plano.iamControlUserId})
                or p.usuario_id = ${usuarioId})
         order by (exists (select 1 from eventos.pessoa_evento pe where pe.pessoa_id = p.id and pe.iam_control_user_id = ${plano.iamControlUserId})) desc
         limit 1
         for update`,
  );
  if (existente) {
    await tx.execute(sql`
      update core.pessoa set nome_completo = ${plano.nome}, email = ${plano.email}, telefone = coalesce(${plano.telefone}, telefone),
             usuario_id = ${usuarioId}, ativo = ${plano.ativo}, atualizado_em = ${agora}
       where id = ${existente.id}`);
    return existente.id;
  }
  // Só cria pessoa para o staff ativo: minimização.
  if (!plano.ativo || !plano.escalavel) return null;
  const criada = await uma<{ id: string }>(
    tx,
    sql`insert into core.pessoa (usuario_id, nome_completo, email, telefone, ativo, criado_em, atualizado_em)
        values (${usuarioId}, ${plano.nome}, ${plano.email}, ${plano.telefone}, true, ${agora}, ${agora}) returning id`,
  );
  return criada!.id;
}

export function criarRepositorioColaboradores(db: Db): RepositorioColaboradores {
  return {
    salvarColaborador(plano, agora) {
      return db.transaction(async (tx) => {
        const usuario = await salvarUsuario(tx, plano, agora);
        if (!usuario) return { acao: "IGNORADO_INATIVO", escalavel: false };

        const pessoaId = await salvarPessoa(tx, plano, usuario.id, agora);
        if (pessoaId && plano.escalavel) {
          await tx.execute(sql`
            insert into eventos.pessoa_evento (pessoa_id, iam_control_user_id, criado_em, atualizado_em)
            values (${pessoaId}, ${plano.iamControlUserId}, ${agora}, ${agora})
            on conflict (pessoa_id) do update set iam_control_user_id = excluded.iam_control_user_id, atualizado_em = excluded.atualizado_em`);
          if (plano.funcoesDoEventos.length > 0) {
            await tx.execute(sql`
              insert into eventos.pessoa_funcao (pessoa_id, funcao_id)
              select ${pessoaId}, id from eventos.funcao
               where ativo and codigo in (${sql.join(
                 plano.funcoesDoEventos.map((codigo) => sql`${codigo}`),
                 sql`, `,
               )})
              on conflict do nothing`);
          }
        }
        return { acao: usuario.acao, escalavel: plano.escalavel };
      });
    },
  };
}
