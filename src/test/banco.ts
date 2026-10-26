import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { criarDb, type Db } from "@/core/db/database";

// Banco descartável para testes de integração: estrutura do GH (fixture) + migrations do Eventos,
// na mesma ordem do iam-pessoas. Só roda com TEST_DATABASE_URL (usuário que pode criar banco).

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/gh-schema.sql");
const MIGRATIONS = path.resolve(import.meta.dirname, "../core/db/migrations");

export type BancoDeTeste = { db: Db; sql: (texto: string, params?: unknown[]) => Promise<unknown[]>; encerrar: () => Promise<void> };

export async function criarBancoDeTeste(): Promise<BancoDeTeste> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL não definida");

  const nome = `eventos_teste_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nome}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${nome}`;

  const carga = new Client({ connectionString: url.toString() });
  await carga.connect();
  await carga.query(readFileSync(FIXTURE, "utf8"));
  await carga.end();

  const { db, pool } = criarDb(url.toString(), "eventos-teste");
  await migrate(db, {
    migrationsFolder: MIGRATIONS,
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations_eventos",
  });

  return {
    db,
    sql: async (texto, params = []) => (await pool.query(texto, params)).rows,
    encerrar: async () => {
      await pool.end();
      const limpeza = new Client({ connectionString: TEST_DATABASE_URL });
      await limpeza.connect();
      await limpeza.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await limpeza.end();
    },
  };
}
