import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { modoDemo, modoLocal } from "@/core/ambiente";
import {
  type Ator,
  ATOR_DA_DEMO,
  COOKIE_ATOR_LOCAL,
  criarSupabaseDoServidor,
  resolverAtorPorEmail,
  resolverAtorPorId,
  usuarioDoCookieLocal,
} from "@/core/auth";
import { type Permissao, pode } from "@/core/autorizacao";
import { bancoParaLeitura, situacaoDaEscrita } from "@/fluxos/_base";

export type { Ator, PerfilDoEventos } from "@/core/auth";

// Quem está usando o app (docs/09 §3). Login real pelo Supabase; no modo local, "Entrar como" (cookie eventos_ator_local),
// que só vale com as três travas do banco local abertas. Resolvido do banco a cada requisição (cache só dentro dela).

export type SituacaoDoAtor =
  | { situacao: "OK"; ator: Ator }
  /** Sem sessão: `destino` é a tela de entrada do ambiente. */
  | { situacao: "SEM_SESSAO"; destino: "/login" | "/entrar-local" }
  /** Sessão válida sem core.usuario ativo: sai da sessão e volta ao login com aviso. */
  | { situacao: "SEM_CADASTRO" }
  | { situacao: "SEM_PERFIL"; email: string };

/** Modo local com as três travas abertas (a mesma decisão da guarda de escrita, inclusive o marcador no banco). */
export async function entradaLocalLiberada(): Promise<boolean> {
  if (!modoLocal()) return false;
  return (await situacaoDaEscrita()).liberada;
}

async function situacaoLocal(): Promise<SituacaoDoAtor> {
  if (!(await entradaLocalLiberada())) return { situacao: "SEM_SESSAO", destino: "/login" };
  const usuarioId = usuarioDoCookieLocal((await cookies()).get(COOKIE_ATOR_LOCAL)?.value);
  if (!usuarioId) return { situacao: "SEM_SESSAO", destino: "/entrar-local" };
  const resolucao = await resolverAtorPorId(usuarioId, await bancoParaLeitura());
  return resolucao.situacao === "SEM_CADASTRO" ? { situacao: "SEM_SESSAO", destino: "/entrar-local" } : resolucao;
}

async function situacaoDaSessao(): Promise<SituacaoDoAtor> {
  const supabase = await criarSupabaseDoServidor();
  if (!supabase) return { situacao: "SEM_SESSAO", destino: "/login" };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { situacao: "SEM_SESSAO", destino: "/login" };
  // O Google confirma o e-mail; sem confirmação, o e-mail não identifica ninguém.
  if (!user.email || !user.email_confirmed_at) return { situacao: "SEM_CADASTRO" };
  return resolverAtorPorEmail(user.email, await bancoParaLeitura());
}

/** Uma vez por requisição. */
export const situacaoDoAtor = cache(async (): Promise<SituacaoDoAtor> => {
  if (modoDemo()) return { situacao: "OK", ator: ATOR_DA_DEMO };
  return modoLocal() ? situacaoLocal() : situacaoDaSessao();
});

/** Contrato com a autorização (docs/09 §3.2, `atorDaRequisicao`): nulo = sem sessão, sem cadastro ou sem perfil do Eventos. */
export async function obterAtor(): Promise<Ator | null> {
  const atual = await situacaoDoAtor();
  return atual.situacao === "OK" ? atual.ator : null;
}

/** Para o layout do (time): sem ator, leva à tela certa. Nada do Eventos é lido antes desta decisão. */
export async function exigirAtor(): Promise<Ator> {
  const atual = await situacaoDoAtor();
  switch (atual.situacao) {
    case "OK":
      return atual.ator;
    case "SEM_SESSAO":
      redirect(atual.destino);
    case "SEM_CADASTRO":
      // Server Component não apaga cookie: /auth/encerrar envia o POST que encerra a sessão.
      redirect("/auth/encerrar?motivo=sem-cadastro");
    case "SEM_PERFIL":
      redirect("/sem-acesso");
    default: {
      const desconhecida: never = atual;
      throw new Error(`situação do ator desconhecida: ${JSON.stringify(desconhecida)}`);
    }
  }
}

/**
 * Para as páginas esconderem o que o ator não pode fazer (camada 1 da autorização, docs/09 §4.1). Só esconde:
 * quem decide é executarAcao, que confere a permissão de novo.
 */
export async function permissoesDoAtor<P extends Permissao>(...permissoes: P[]): Promise<Record<P, boolean>> {
  const ator = await exigirAtor();
  return Object.fromEntries(permissoes.map((permissao) => [permissao, pode(ator, permissao)])) as Record<P, boolean>;
}
