import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as core from "./schema/core";
import * as eventos from "./schema/eventos";

export const schema = { ...core, ...eventos };
export type Db = NodePgDatabase<typeof schema>;
/** O banco ou a transação aberta (`tx.transaction` vira savepoint). Repositórios recebem um Executor. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Conexão Drizzle. Separada de client.ts para os testes abrirem a deles sem ler o ambiente. */
export function criarDb(connectionString: string, applicationName = "eventos-web"): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, application_name: applicationName });
  return { db: drizzle({ client: pool, schema }), pool };
}
