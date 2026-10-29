"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { abrirEnquete } from "@/fluxos/disponibilidade";
import { abrirEnqueteSchema } from "@/modules/disponibilidade";

export async function abrirEnqueteAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  const agora = new Date();
  return executarAcao(form, abrirEnqueteSchema(agora), "disponibilidade.gerir", async (dados, ator) => {
    const enqueteId = await abrirEnquete(dados, ator, agora);
    revalidatePath("/disponibilidade");
    redirect(`/disponibilidade/${enqueteId}?criada=1`);
  });
}
