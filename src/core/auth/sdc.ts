import { sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";

import { type ResolucaoDoAtor, resolverAtorPorEmail, resolverAtorPorId } from "./ator";

// Ator da SDC (docs/09 §15): a agência parceira que compra passagem e hotel. É gente de fora: não existe em core.usuario
// e não tem perfil do GH. Quem é SDC é quem está ATIVO em eventos.acesso_sdc, lista mantida pela líder. Lido do banco a
// cada requisição, como o time: desativar o e-mail corta o acesso no próximo clique.
// É um tipo separado do Ator do time de propósito: nada que recebe um `Ator` aceita um `AtorSdc` (e vice-versa).

export type AtorSdc = {
  /** eventos.acesso_sdc.id */
  acessoSdcId: string;
  nome: string;
  email: string;
  origem: "SESSAO" | "LOCAL";
};

export type CadastroDaSdc = { id: string; email: string; nome: string; ativo: boolean };

/** E-mail como fica na lista e como é comparado: sem espaços nas pontas e em minúsculas. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Decisão pura (fail-closed): sem linha, linha inativa ou e-mail que não bate exatamente com o da sessão → não é SDC. */
export function decidirAcessoDaSdc(cadastro: CadastroDaSdc | null | undefined, origem: AtorSdc["origem"], emailDaSessao?: string): AtorSdc | null {
  if (!cadastro || cadastro.ativo !== true) return null;
  if (emailDaSessao !== undefined && cadastro.email !== normalizarEmail(emailDaSessao)) return null;
  return { acessoSdcId: cadastro.id, nome: cadastro.nome, email: cadastro.email, origem };
}

/** Login real: o e-mail já foi confirmado pelo provedor (quem chama confere). Comparação exata, em minúsculas. */
export async function resolverSdcPorEmail(email: string, executor: Executor): Promise<AtorSdc | null> {
  const normalizado = normalizarEmail(email);
  if (!normalizado) return null;
  const linhas = await executor.execute<CadastroDaSdc>(sql`select id, email, nome, ativo from eventos.acesso_sdc where email = ${normalizado} limit 1`);
  return decidirAcessoDaSdc(linhas.rows[0], "SESSAO", normalizado);
}

/** Modo local ("Entrar como"): o id vem do cookie eventos_ator_local; mesma regra do login real. */
export async function resolverSdcPorId(acessoSdcId: string, executor: Executor): Promise<AtorSdc | null> {
  const linhas = await executor.execute<CadastroDaSdc>(sql`select id, email, nome, ativo from eventos.acesso_sdc where id = ${acessoSdcId} limit 1`);
  return decidirAcessoDaSdc(linhas.rows[0], "LOCAL");
}

/** E-mails ativos da SDC no banco local, para o seletor "Entrar como". */
export async function listarSdcLocais(executor: Executor): Promise<CadastroDaSdc[]> {
  return (await executor.execute<CadastroDaSdc>(sql`select a.id, a.email, a.nome, a.ativo from eventos.acesso_sdc a
     where a.ativo and not exists (select 1 from core.usuario u where lower(btrim(u.email)) = a.email)
     order by lower(a.nome)`)).rows;
}

/**
 * O e-mail é de alguém da IAM: existe em core.usuario, ativo ou não, apagado ou não. Decisão da líder (docs/09 §15.2):
 * esse e-mail NUNCA é SDC. Quem perde o perfil do Eventos ou é desativado fica sem acesso; não "vira" SDC.
 */
export async function emailEhDaIam(email: string, executor: Executor): Promise<boolean> {
  const normalizado = normalizarEmail(email);
  if (!normalizado) return false;
  const linhas = await executor.execute(sql`select 1 from core.usuario where lower(btrim(email)) = ${normalizado} limit 1`);
  return linhas.rows.length > 0;
}

/** O que o Supabase devolve em getUser() e que interessa aqui. */
export type UsuarioDoProvedor = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
  identities?: { provider?: string; identity_data?: Record<string, unknown> | null }[] | null;
};

/** Claims do token da sessão (getClaims()): quem é (`sub`) e como a sessão foi autenticada (`amr`). */
export type ClaimsDaSessao = { sub?: unknown; amr?: unknown } | null | undefined;

/** Métodos que provam outra forma de entrar que não o provedor (senha, código por e-mail, anônimo…). */
const METODOS_QUE_NAO_SAO_DO_PROVEDOR = new Set(["password", "otp", "magiclink", "anonymous", "sso/saml", "web3", "recovery", "invite", "email/signup", "email_change", "phone_change"]);

/**
 * A sessão foi autenticada pelo Google, com o mesmo e-mail (docs/09 §15.2)? Só assim alguém pode ser ator SDC: uma
 * conta do Supabase criada por senha, link mágico ou login anônimo com o e-mail da lista não basta. Fail-closed:
 * qualquer informação ausente ou inesperada → falso.
 *   1. o usuário não é anônimo e tem o e-mail confirmado;
 *   2. ele tem uma identidade `google` cujo e-mail é o mesmo do usuário (e não está marcado como não verificado);
 *   3. o token desta sessão é dele (`sub`) e o `amr` diz que ela nasceu de um login por provedor (`oauth`), sem nenhum
 *      método de senha, código, link ou anônimo.
 */
export function sessaoAutenticadaPeloGoogle(usuario: UsuarioDoProvedor | null | undefined, claims: ClaimsDaSessao): boolean {
  if (!usuario || usuario.is_anonymous === true || !usuario.email || !usuario.email_confirmed_at) return false;
  const email = normalizarEmail(usuario.email);
  const doGoogle = (usuario.identities ?? []).some((identidade) => {
    if (identidade?.provider !== "google") return false;
    const dados = identidade.identity_data ?? {};
    return typeof dados.email === "string" && normalizarEmail(dados.email) === email && dados.email_verified !== false;
  });
  if (!doGoogle) return false;

  if (!claims || typeof claims.sub !== "string" || claims.sub !== usuario.id || !Array.isArray(claims.amr) || claims.amr.length === 0) return false;
  const metodos: unknown[] = claims.amr.map((entrada: unknown) => (typeof entrada === "string" ? entrada : entrada && typeof entrada === "object" ? (entrada as { method?: unknown }).method : null));
  if (metodos.some((metodo) => typeof metodo !== "string")) return false;
  if (metodos.some((metodo) => METODOS_QUE_NAO_SAO_DO_PROVEDOR.has(metodo as string))) return false;
  return metodos.includes("oauth");
}

/** Quem entrou: alguém do time (ou sem acesso, como antes) ou alguém da SDC. */
export type ResolucaoDoAcesso = ResolucaoDoAtor | { situacao: "SDC"; sdc: AtorSdc };

/**
 * Decisão pura: o time vem primeiro e gente da IAM nunca é SDC. A lista da SDC só vale para quem NÃO existe em
 * core.usuario (`ehDaIam` falso). Usuário da IAM inativo ou sem perfil do Eventos continua sem acesso, como antes.
 */
export function decidirQuemEntrou(doTime: ResolucaoDoAtor, ehDaIam: boolean, sdc: AtorSdc | null): ResolucaoDoAcesso {
  if (doTime.situacao !== "SEM_CADASTRO" || ehDaIam !== false || !sdc) return doTime;
  return { situacao: "SDC", sdc };
}

/**
 * Login real: primeiro as regras do time; a lista da SDC só é consultada para e-mail que não existe em core.usuario e
 * só quando a sessão foi autenticada pelo Google (`pelaContaGoogle`, obrigatório: quem chama decide com
 * sessaoAutenticadaPeloGoogle). O time não passa por essa exigência nesta rodada (docs/09 §15.2).
 */
export async function resolverAcessoPorEmail(email: string, executor: Executor, { pelaContaGoogle }: { pelaContaGoogle: () => Promise<boolean> }): Promise<ResolucaoDoAcesso> {
  const doTime = await resolverAtorPorEmail(email, executor);
  if (doTime.situacao !== "SEM_CADASTRO") return doTime;
  if (await emailEhDaIam(email, executor)) return doTime;
  const sdc = await resolverSdcPorEmail(email, executor);
  if (!sdc || (await pelaContaGoogle()) !== true) return doTime;
  return decidirQuemEntrou(doTime, false, sdc);
}

/** Modo local: o id do cookie é de um core.usuario ou de uma linha de eventos.acesso_sdc (mesma regra: gente da IAM nunca é SDC). */
export async function resolverAcessoPorId(id: string, executor: Executor): Promise<ResolucaoDoAcesso> {
  const doTime = await resolverAtorPorId(id, executor);
  if (doTime.situacao !== "SEM_CADASTRO") return doTime;
  const sdc = await resolverSdcPorId(id, executor);
  if (!sdc) return doTime;
  return decidirQuemEntrou(doTime, await emailEhDaIam(sdc.email, executor), sdc);
}
