"use server";

import { revalidatePath } from "next/cache";

import * as fluxo from "@/fluxos/escalas";
import { aprovarEscalaSchema, devolverEscalaSchema } from "@/modules/escala";

import { executarAcao, type ResultadoAcao } from "../../_servidor/acao";

function atualizarTelas(eventoId: string) {
  revalidatePath("/escalas/aprovacao");
  revalidatePath("/escalas");
  revalidatePath(`/eventos/${eventoId}`, "layout");
  revalidatePath("/calendario");
  revalidatePath("/inicio");
}

export async function aprovarEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, aprovarEscalaSchema, "escala.aprovar", async (dados, ator) => {
    const { codigo } = await fluxo.aprovarEscala(dados, { ator, agora: new Date() });
    atualizarTelas(dados.eventoId);
    return `Escala ${codigo ?? "do evento"} aprovada.`;
  });
}

export async function devolverEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, devolverEscalaSchema, "escala.aprovar", async (dados, ator) => {
    const { codigo } = await fluxo.devolverEscala(dados, { ator, agora: new Date() });
    atualizarTelas(dados.eventoId);
    return `Escala ${codigo ?? "do evento"} devolvida.`;
  });
}
