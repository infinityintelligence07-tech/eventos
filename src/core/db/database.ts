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

const CONEXAO_PARADA_MS = 5 * 60 * 1000;

/** Conexão Drizzle. Separada de client.ts para os testes abrirem a deles sem ler o ambiente. */
export function criarDb(connectionString: string, applicationName = "eventos-web", opcoes: OpcoesDoBanco = {}): { db: Db; pool: Pool } {
  const pool = new Pool({
    connectionString,
    application_name: applicationName,
    // O padrão do pg fecha a conexão com 10 s parada; reabrir custa várias idas e voltas até o banco (o servidor do app
    // fica longe dele), e quase todo clique do time chegava com o pool vazio.
    idleTimeoutMillis: CONEXAO_PARADA_MS,
    keepAlive: true,
    // Scripts de linha de comando que não fecham o pool terminam mesmo assim, sem esperar os 5 minutos.
    allowExitOnIdle: true,
    ...(opcoes.max !== undefined ? { max: opcoes.max } : {}),
    ...(opcoes.somenteLeitura ? { options: "-c default_transaction_read_only=on" } : {}),
  });
  // Conexão parada que o servidor derruba: o pool a descarta sozinho; sem ouvinte, o erro derrubaria o processo.
  pool.on("error", () => undefined);
  return { db: drizzle({ client: pool, schema }), pool };
}
