"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { registrarEnvioDaCopy } from "@/fluxos/comunicacao";
import { marcarCopyComoEnviadaSchema } from "@/modules/comunicacao";

export async function marcarCopyComoEnviada(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, marcarCopyComoEnviadaSchema, "comunicacao.enviar", async (dados, ator) => {
    const envio = await registrarEnvioDaCopy(dados, ator, new Date());
    // O layout do evento mostra a situação da escala, que muda para "comunicada" com a última copy.
    revalidatePath(`/eventos/${envio.eventoId}`, "layout");
    revalidatePath("/comunicacao");
    revalidatePath("/inicio");
    revalidatePath("/calendario");
    return envio.comunicada
      ? `Copy de ${envio.nome} marcada como enviada. Todas as copys foram enviadas: escala comunicada.`
      : `Copy de ${envio.nome} marcada como enviada.`;
  });
}
