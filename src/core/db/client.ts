import { config } from "@/core/config";

import { criarDb } from "./database";

export type { Db } from "./database";

export const { db, pool } = criarDb(config.DATABASE_URL);

/**
 * Conexão da sincronização de turmas: o papel app_eventos_worker (0009), quando WORKER_DATABASE_URL existe.
 * Sem ela, usa a mesma conexão do app (banco local e testes). O pool só conecta quando é usado.
 */
export const worker = config.WORKER_DATABASE_URL ? criarDb(config.WORKER_DATABASE_URL, "eventos-worker", { max: 3 }) : { db, pool };
