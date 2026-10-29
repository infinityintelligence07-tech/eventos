"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { arquivarLocal, salvarLocal } from "@/fluxos/eventos";
import { arquivarLocalSchema, salvarLocalSchema } from "@/modules/eventos";

export async function salvarLocalAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarLocalSchema, "config.locais", async (dados, ator) => {
    await salvarLocal(dados, ator, new Date());
    revalidatePath("/configuracoes/locais");
    return dados.lat === null
      ? `${dados.nome} salvo. Sem latitude e longitude, a distância até ele não é calculada.`
      : `${dados.nome} salvo.`;
  });
}

export async function arquivarLocalAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, arquivarLocalSchema, "config.locais", async ({ localId }, ator) => {
    await arquivarLocal(localId, ator, new Date());
    revalidatePath("/configuracoes/locais");
    return "Local arquivado. Ele não aparece mais nas listas.";
  });
}
