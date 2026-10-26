import { createJobQueue, errorMessage, isTransientDbError } from "@/core/jobs";
import { logger, withCorrelationId } from "@/core/logging";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWorkerOnce(): Promise<void> {
  const boss = createJobQueue();
  let stopping = false;

  boss.on("error", (cause: unknown) => {
    const message = errorMessage(cause);
    if (isTransientDbError(message)) {
      logger.warn(
        { componente: "worker", erro: message },
        "pg-boss: conexão transitória (processo permanece ativo)",
      );
      return;
    }
    logger.error({ componente: "worker", erro: message }, "pg-boss error");
  });

  boss.on("warning", (warning: unknown) => {
    logger.warn({ componente: "worker", warning: errorMessage(warning) }, "pg-boss warning");
  });

  await boss.start();
  // Jobs entram aqui conforme os módulos forem criados
  // (sincronização de turmas do IAM Control, rotas do Google Maps, envio de mensagens).

  withCorrelationId("worker-startup", () => {
    logger.info({ componente: "worker" }, "worker iniciado");
  });

  await new Promise<void>((resolve) => {
    const stop = async (signal: string): Promise<void> => {
      if (stopping) {
        return;
      }
      stopping = true;
      logger.info({ componente: "worker", signal }, "worker encerrando");
      try {
        await boss.stop({ graceful: true, timeout: 10_000 });
      } catch (cause: unknown) {
        logger.warn({ componente: "worker", erro: errorMessage(cause) }, "falha ao encerrar pg-boss");
      }
      resolve();
    };

    process.once("SIGINT", () => {
      void stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      void stop("SIGTERM");
    });
  });
}

async function runWorker(): Promise<void> {
  let attempt = 0;

  for (;;) {
    try {
      await runWorkerOnce();
      return;
    } catch (cause: unknown) {
      attempt += 1;
      const message = errorMessage(cause);
      logger.error({ componente: "worker", erro: message, attempt }, "worker falhou ao iniciar");
      if (!isTransientDbError(message) && attempt >= 5) {
        throw cause instanceof Error ? cause : new Error(message);
      }
      const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempt, 5));
      logger.warn({ componente: "worker", attempt, delayMs }, "reiniciando worker após falha transitória");
      await sleep(delayMs);
    }
  }
}

runWorker().catch((cause: unknown) => {
  logger.error({ erro: errorMessage(cause) }, "worker falhou");
  process.exitCode = 1;
});
