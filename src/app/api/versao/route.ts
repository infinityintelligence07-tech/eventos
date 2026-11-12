import { versaoDoCodigo } from "@/core/versao";

export const dynamic = "force-dynamic";

// Qual código está no ar: o do site (arquivo gravado no build) e o do worker (que grava no banco ao subir).
// O fluxo Deploy consulta esta rota depois de publicar. Não expõe nada além das impressões digitais.
export async function GET(): Promise<Response> {
  const web = versaoDoCodigo();
  try {
    const { versaoDoWorker } = await import("@/core/db/processo");
    return Response.json({ web, worker: await versaoDoWorker() });
  } catch {
    // Banco fora do ar ou tabela ainda sem migration: a versão do site continua valendo.
    return Response.json({ web, worker: null });
  }
}
