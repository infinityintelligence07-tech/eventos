import type { Job, PgBoss, Queue } from "pg-boss";

import { db } from "@/core/db/client";
import { iamControlDoAmbiente } from "@/core/integrations/iam-control";
import { logger, withCorrelationId } from "@/core/logging";
import { criarRepositorioVagas } from "@/modules/escala";
import { criarRepositorioSincronizacao } from "@/modules/eventos";

import { type ResumoSincronizacao, sincronizarTurmas } from "./sincronizar-turmas";

export const SINCRONIZAR_TURMAS_JOB = "sincronizar-turmas";
/** A cada 30 minutos, das 6h às 23h (horário de Brasília). */
export const SINCRONIZAR_TURMAS_CRON = "*/30 6-23 * * *";

const OPCOES = {
  // Uma sincronização por vez: se a anterior ainda roda, a próxima não empilha.
  policy: "exclusive",
  expireInSeconds: 600,
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  retentionSeconds: 7 * 24 * 3600,
  deleteAfterSeconds: 7 * 24 * 3600,
} satisfies Omit<Queue, "name">;

/** Sincroniza com as dependências reais e registra o resumo no log. */
export async function executarSincronizacaoCom(filtros: { aPartirDe?: string; ate?: string } = {}): Promise<ResumoSincronizacao> {
  const resumo = await sincronizarTurmas(
    {
      iamControl: iamControlDoAmbiente(),
      eventos: criarRepositorioSincronizacao(db),
      vagas: criarRepositorioVagas(db, { origem: "SISTEMA" }),
      agora: new Date(),
    },
    filtros,
  );
  registrarResumo(resumo);
  return resumo;
}

function registrarResumo(resumo: ResumoSincronizacao): void {
  const { ignoradas, codigosEmConflito, avisosDeVagas, falhas, ...contagens } = resumo;
  logger.info(
    { componente: "sincronizar-turmas", ...contagens, ignoradas: ignoradas.length, conflitos: codigosEmConflito.length },
    "turmas sincronizadas",
  );
  if (codigosEmConflito.length) {
    logger.warn({ componente: "sincronizar-turmas", codigosEmConflito }, "código de evento já usado por outro evento");
  }
  if (avisosDeVagas.length) {
    logger.warn({ componente: "sincronizar-turmas", avisosDeVagas }, "avisos ao gerar vagas");
  }
  if (falhas.length) {
    logger.error({ componente: "sincronizar-turmas", falhas }, "turmas com falha");
  }
}

async function handle(job: Job<object>): Promise<void> {
  await withCorrelationId(job.id, async () => {
    await executarSincronizacaoCom();
  });
}

export async function registrarSincronizacaoDeTurmas(boss: PgBoss): Promise<void> {
  await boss.createQueue(SINCRONIZAR_TURMAS_JOB, OPCOES);
  await boss.schedule(SINCRONIZAR_TURMAS_JOB, SINCRONIZAR_TURMAS_CRON, null, { tz: "America/Sao_Paulo" });
  await boss.work<object>(SINCRONIZAR_TURMAS_JOB, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await handle(job);
  });
}
