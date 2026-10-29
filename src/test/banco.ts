import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { criarDb, type Db } from "@/core/db/database";

import { lerCredenciaisLocais, urlLocal } from "./credenciais-locais";

// Banco descartável para testes de integração: estrutura do GH (fixture) + migrations do Eventos + proposta de
// papéis do GH, na mesma ordem do iam-pessoas. Só roda com TEST_DATABASE_URL (usuário que pode criar banco).
// TEST_DATABASE_URL=local usa o Postgres do banco:local, com a senha guardada em .banco-local/ (não aparece).

function resolverUrlDeTeste(valor: string | undefined): string | undefined {
  if (valor !== "local") return valor;
  const credenciais = lerCredenciaisLocais();
  if (!credenciais) throw new Error("TEST_DATABASE_URL=local: rode antes `npm run banco:local` (gera .banco-local/credenciais.json).");
  return urlLocal("postgres", credenciais.postgres, "postgres");
}

export const TEST_DATABASE_URL = resolverUrlDeTeste(process.env.TEST_DATABASE_URL);

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/gh-schema.sql");
const MIGRATIONS = path.resolve(import.meta.dirname, "../core/db/migrations");
const PROPOSTA_DO_GH = path.resolve(import.meta.dirname, "../../docs/gh-proposta-papeis-do-eventos.sql");

export type PapelDoApp = "app_eventos" | "app_eventos_leitura" | "app_eventos_copia";

export type BancoDeTeste = {
  db: Db;
  sql: (texto: string, params?: unknown[]) => Promise<unknown[]>;
  /** Roda como o papel (SET LOCAL ROLE numa transação desfeita no fim): exercita grants e RLS de verdade. */
  comoPapel: (papel: PapelDoApp, texto: string, params?: unknown[]) => Promise<unknown[]>;
  encerrar: () => Promise<void>;
};

/**
 * Num banco vazio: estrutura do GH (fixture), migrations do Eventos e a proposta de acesso do GH aos papéis do
 * Eventos (perfis, grants e políticas no core). Usado também por `npm run banco:local`.
 */
export async function aplicarEstrutura(connectionString: string, db: Db): Promise<void> {
  const carga = new Client({ connectionString });
  await carga.connect();
  await carga.query(readFileSync(FIXTURE, "utf8"));
  await carga.end();

  await migrate(db, {
    migrationsFolder: MIGRATIONS,
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations_eventos",
  });

  const proposta = new Client({ connectionString });
  await proposta.connect();
  await proposta.query(readFileSync(PROPOSTA_DO_GH, "utf8"));
  await proposta.end();
}

export async function criarBancoDeTeste(): Promise<BancoDeTeste> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL não definida");

  const nome = `eventos_teste_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nome}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${nome}`;

  const { db, pool } = criarDb(url.toString(), "eventos-teste");
  await aplicarEstrutura(url.toString(), db);

  return {
    db,
    sql: async (texto, params = []) => (await pool.query(texto, params)).rows,
    comoPapel: async (papel, texto, params = []) => {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(`SET LOCAL ROLE ${papel}`);
        return (await cliente.query(texto, params)).rows;
      } finally {
        await cliente.query("ROLLBACK");
        cliente.release();
      }
    },
    encerrar: async () => {
      await pool.end();
      const limpeza = new Client({ connectionString: TEST_DATABASE_URL });
      await limpeza.connect();
      await limpeza.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await limpeza.end();
    },
  };
}
