// npm run sync:colaboradores
// Roda a sincronização dos colaboradores do IAM Control uma vez, sem a fila, e registra o resumo no log.
import { pool } from "@/core/db/client";
import { logger } from "@/core/logging";

import { executarSincronizacaoDeColaboradores } from "./sincronizar-colaboradores-job";

try {
  await executarSincronizacaoDeColaboradores();
} catch (cause: unknown) {
  logger.error({ erro: cause instanceof Error ? cause.message : String(cause) }, "sincronização de colaboradores falhou");
  process.exitCode = 1;
} finally {
  await pool.end();
}
