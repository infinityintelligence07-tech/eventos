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
  return (await executor.execute<CadastroDaSdc>(sql`select id, email, nome, ativo from eventos.acesso_sdc where ativo order by lower(nome)`)).rows;
}

/** Quem entrou: alguém do time (ou sem acesso, como antes) ou alguém da SDC. */
export type ResolucaoDoAcesso = ResolucaoDoAtor | { situacao: "SDC"; sdc: AtorSdc };

/**
 * Decisão pura: o time vem primeiro. Quem tem perfil do Eventos continua sendo do time mesmo com o e-mail na lista da
 * SDC; a lista só vale para quem não é do time (sem cadastro na IAM ou sem perfil do Eventos).
 */
export function decidirQuemEntrou(doTime: ResolucaoDoAtor, sdc: AtorSdc | null): ResolucaoDoAcesso {
  if (doTime.situacao === "OK" || !sdc) return doTime;
  return { situacao: "SDC", sdc };
}

/** Login real (e-mail confirmado pelo provedor): primeiro as regras do time, depois a lista da SDC. */
export async function resolverAcessoPorEmail(email: string, executor: Executor): Promise<ResolucaoDoAcesso> {
  const doTime = await resolverAtorPorEmail(email, executor);
  if (doTime.situacao === "OK") return doTime;
  return decidirQuemEntrou(doTime, await resolverSdcPorEmail(email, executor));
}

/** Modo local: o id do cookie é de um core.usuario ou de uma linha de eventos.acesso_sdc. */
export async function resolverAcessoPorId(id: string, executor: Executor): Promise<ResolucaoDoAcesso> {
  const doTime = await resolverAtorPorId(id, executor);
  if (doTime.situacao !== "SEM_CADASTRO") return doTime;
  return decidirQuemEntrou(doTime, await resolverSdcPorId(id, executor));
}
