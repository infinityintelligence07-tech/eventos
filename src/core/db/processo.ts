import { eq, sql } from "drizzle-orm";

import { db, worker } from "./client";
import { processo } from "./schema/eventos";

const WORKER = "worker";

/** O worker anota, ao subir, qual código está rodando (papel app_eventos_worker). */
export async function registrarVersaoDoWorker(versao: string): Promise<void> {
  await worker.db
    .insert(processo)
    .values({ nome: WORKER, versao })
    .onConflictDoUpdate({ target: processo.nome, set: { versao, iniciadoEm: sql`now()` } });
}

export async function versaoDoWorker(): Promise<{ versao: string; iniciadoEm: string } | null> {
  const [linha] = await db.select({ versao: processo.versao, iniciadoEm: processo.iniciadoEm }).from(processo).where(eq(processo.nome, WORKER));
  return linha ? { versao: linha.versao, iniciadoEm: linha.iniciadoEm.toISOString() } : null;
}
