"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { ajustarLocalDoIamControl, arquivarLocal, salvarLocal } from "@/fluxos/eventos";
import { ajustarLocalDoIamControlSchema, arquivarLocalSchema, salvarLocalSchema } from "@/modules/eventos";

export async function salvarLocalAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarLocalSchema, "config.locais", async (dados, ator) => {
    await salvarLocal(dados, ator, new Date());
    revalidatePath("/configuracoes/locais");
    return dados.lat === null
      ? `${dados.nome} salvo. Sem latitude e longitude, a distância até ele não é calculada.`
      : `${dados.nome} salvo.`;
  });
}

/** Local vindo do IAM Control: só tipo, complemento, capacidade e localização no mapa (nome e endereço mudam lá). */
export async function ajustarLocalDoIamControlAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, ajustarLocalDoIamControlSchema, "config.locais", async (dados, ator) => {
    await ajustarLocalDoIamControl(dados, ator, new Date());
    revalidatePath("/configuracoes/locais");
    return dados.lat === null ? "Local salvo. Sem latitude e longitude, a distância até ele não é calculada." : "Local salvo.";
  });
}

export async function arquivarLocalAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, arquivarLocalSchema, "config.locais", async ({ localId }, ator) => {
    await arquivarLocal(localId, ator, new Date());
    revalidatePath("/configuracoes/locais");
    return "Local arquivado. Ele não aparece mais nas listas.";
  });
}
