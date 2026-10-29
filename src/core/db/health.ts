import { logger } from "@/core/logging";

import { pool } from "./client";

export async function verificarBanco(): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch (cause: unknown) {
    logger.error({ componente: "health", erro: cause instanceof Error ? cause.message : String(cause) }, "banco indisponível");
    return false;
  }
}
