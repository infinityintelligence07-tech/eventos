// npm run sync:turmas [-- --a-partir-de=2026-01-01] [-- --ate=2026-12-31]
// Roda a sincronização uma vez, sem a fila, e imprime o resumo.
import { pool } from "@/core/db/client";
import { logger } from "@/core/logging";

import { executarSincronizacaoCom } from "./sincronizar-turmas-job";

function argumento(nome: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.split("=")[1];
}

try {
  await executarSincronizacaoCom({ aPartirDe: argumento("a-partir-de"), ate: argumento("ate") });
} catch (cause: unknown) {
  logger.error({ erro: cause instanceof Error ? cause.message : String(cause) }, "sincronização falhou");
  process.exitCode = 1;
} finally {
  await pool.end();
}
