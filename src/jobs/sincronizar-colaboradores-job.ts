import type { Job, PgBoss, Queue } from "pg-boss";

import { db } from "@/core/db/client";
import { iamControlDoAmbiente } from "@/core/integrations/iam-control";
import { logger, withCorrelationId } from "@/core/logging";
import { criarRepositorioColaboradores } from "@/modules/pessoas";

import { type ResumoColaboradores, sincronizarColaboradores } from "./sincronizar-colaboradores";

export const SINCRONIZAR_COLABORADORES_JOB = "sincronizar-colaboradores";
/** A cada 30 minutos, das 6h às 23h (horário de Brasília), defasado da sincronização de turmas. */
export const SINCRONIZAR_COLABORADORES_CRON = "15,45 6-23 * * *";

const OPCOES = {
  policy: "exclusive",
  expireInSeconds: 600,
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  retentionSeconds: 7 * 24 * 3600,
  deleteAfterSeconds: 7 * 24 * 3600,
} satisfies Omit<Queue, "name">;

/** Sincroniza com as dependências reais e registra o resumo no log (sem e-mails nem nomes). */
export async function executarSincronizacaoDeColaboradores(): Promise<ResumoColaboradores> {
  const resumo = await sincronizarColaboradores({
    iamControl: iamControlDoAmbiente(),
    colaboradores: criarRepositorioColaboradores(db),
    agora: new Date(),
  });
  const { ignorados, falhas, ...contagens } = resumo;
  logger.info({ componente: "sincronizar-colaboradores", ...contagens, ignorados: ignorados.length, falhas: falhas.length }, "colaboradores sincronizados");
  if (ignorados.length) logger.warn({ componente: "sincronizar-colaboradores", ignorados }, "colaboradores ignorados");
  if (falhas.length) logger.error({ componente: "sincronizar-colaboradores", falhas }, "colaboradores com falha");
  return resumo;
}

async function handle(job: Job<object>): Promise<void> {
  await withCorrelationId(job.id, async () => {
    await executarSincronizacaoDeColaboradores();
  });
}

export async function registrarSincronizacaoDeColaboradores(boss: PgBoss): Promise<void> {
  await boss.createQueue(SINCRONIZAR_COLABORADORES_JOB, OPCOES);
  await boss.schedule(SINCRONIZAR_COLABORADORES_JOB, SINCRONIZAR_COLABORADORES_CRON, null, { tz: "America/Sao_Paulo" });
  await boss.work<object>(SINCRONIZAR_COLABORADORES_JOB, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await handle(job);
  });
}
