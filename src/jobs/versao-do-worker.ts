import { registrarVersaoDoWorker } from "@/core/db/processo";
import { logger } from "@/core/logging";
import { versaoDoCodigo } from "@/core/versao";

/**
 * Anota no banco qual código o worker está rodando, para o deploy conferir pelo GET /api/versao que ele também foi
 * publicado. Falhar aqui (banco fora, migration 0011 ainda não aplicada) não derruba o worker.
 */
export async function anotarVersaoDoWorker(): Promise<string> {
  const versao = versaoDoCodigo();
  try {
    await registrarVersaoDoWorker(versao);
  } catch (cause: unknown) {
    logger.warn(
      { componente: "worker", erro: cause instanceof Error ? cause.message : String(cause) },
      "não foi possível registrar a versão do worker",
    );
  }
  return versao;
}
