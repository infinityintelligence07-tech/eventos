"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { salvarAvisoDeVoos } from "@/fluxos/logistica";
import { salvarAvisoDeVoosSchema } from "@/modules/logistica";

/** O aviso aparece no Início, em Voos e na aba Logística do evento. */
export async function salvarAvisoDeVoosAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarAvisoDeVoosSchema, "config.aviso_de_voos", async (dados, ator) => {
    const aviso = await salvarAvisoDeVoos(dados, ator, new Date());
    revalidatePath("/configuracoes/voos");
    revalidatePath("/logistica", "layout");
    revalidatePath("/eventos/[eventoId]/logistica", "page");
    revalidatePath("/inicio");
    return `Aviso de voos salvo: começa ${aviso.dias} dias antes do evento e o pedido conta como atrasado a partir de ${aviso.diasDoAtraso} dias.`;
  });
}
