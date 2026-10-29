import { sql } from "drizzle-orm";

import { eq } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { pessoa } from "@/core/db/schema/core";
import { carona, convocacao, evento, hospedagem, quarto } from "@/core/db/schema/eventos";

// Trechos de SQL repetidos nos repositórios da logística.

export const CONVOCACAO_ATIVA = ["SUGERIDA", "CONVIDADA", "ACEITA"];

export const nomeDaPessoa = sql<string>`coalesce(${pessoa.nomeSocial}, ${pessoa.nomeCompleto})`;

export const inicioDoEvento = sql<string>`to_char(${evento.inicio} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
export const fimDoEvento = sql<string>`to_char(${evento.fim} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

/** Data do evento ≥ dia (AAAA-MM-DD), no fuso de São Paulo. */
export const eventoTerminaDesde = (dia: string) => sql`(${evento.fim} at time zone 'America/Sao_Paulo')::date >= ${dia}::date`;

/** Compare-and-set por versão: a tela manda o atualizado_em em ISO (milissegundos); o banco guarda microssegundos. */
export const mesmaVersao = (coluna: unknown, iso: string) => sql`date_trunc('milliseconds', ${coluna}) = ${iso}::timestamptz`;

type TabelaTravavel = typeof convocacao | typeof carona | typeof hospedagem | typeof quarto;

/**
 * Trava só a linha da tabela principal. O Postgres não aceita "FOR UPDATE OF" com nome qualificado pelo schema
 * (o que o Drizzle gera) e recusa FOR UPDATE no lado nulo de um LEFT JOIN; o resto é lido depois, sem trava.
 */
export async function travarLinha(executor: Executor, tabela: TabelaTravavel, id: string): Promise<boolean> {
  const linhas = await executor.select({ id: tabela.id }).from(tabela).where(eq(tabela.id, id)).for("update");
  return linhas.length === 1;
}
