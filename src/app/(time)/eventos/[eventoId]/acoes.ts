"use server";

import { revalidatePath } from "next/cache";

import { salvarDadosDoEvento as salvarNoFluxo } from "@/fluxos/eventos";
import { salvarDadosDoEventoSchema } from "@/modules/eventos";

import { executarAcao, type ResultadoAcao } from "../../_servidor/acao";

export async function salvarDadosDoEvento(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarDadosDoEventoSchema, "evento.editar", async (dados, ator) => {
    await salvarNoFluxo(dados, ator, new Date());
    revalidatePath(`/eventos/${dados.eventoId}`, "layout");
    revalidatePath("/calendario");
    revalidatePath("/escalas");
  });
}
