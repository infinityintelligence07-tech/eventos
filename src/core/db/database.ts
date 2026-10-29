import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as core from "./schema/core";
import * as eventos from "./schema/eventos";

export const schema = { ...core, ...eventos };
export type Db = NodePgDatabase<typeof schema>;
/** O banco ou a transação aberta (`tx.transaction` vira savepoint). Repositórios recebem um Executor. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type OpcoesDoBanco = {
  /** Tamanho máximo do pool (padrão do pg: 10). */
  max?: number;
  /**
   * Toda transação da conexão nasce somente leitura (default_transaction_read_only no início da sessão). O papel
   * app_eventos_leitura também tem isso no banco (ALTER ROLE); aqui é a segunda camada, do lado do app.
   */
  somenteLeitura?: boolean;
};

/** Conexão Drizzle. Separada de client.ts para os testes abrirem a deles sem ler o ambiente. */
export function criarDb(connectionString: string, applicationName = "eventos-web", opcoes: OpcoesDoBanco = {}): { db: Db; pool: Pool } {
  const pool = new Pool({
    connectionString,
    application_name: applicationName,
    ...(opcoes.max !== undefined ? { max: opcoes.max } : {}),
    ...(opcoes.somenteLeitura ? { options: "-c default_transaction_read_only=on" } : {}),
  });
  return { db: drizzle({ client: pool, schema }), pool };
}
