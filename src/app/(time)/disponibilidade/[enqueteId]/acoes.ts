"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { alterarEnquete, encerrarEnquete, registrarDisponibilidade } from "@/fluxos/disponibilidade";
import { alterarEnqueteSchema, diaEHora, encerrarEnqueteSchema, registrarDisponibilidadeSchema } from "@/modules/disponibilidade";

function revalidar(enqueteId: string) {
  revalidatePath("/disponibilidade");
  revalidatePath(`/disponibilidade/${enqueteId}`);
}

export async function encerrarEnqueteAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, encerrarEnqueteSchema, "disponibilidade.gerir", async (dados, ator) => {
    await encerrarEnquete(dados, ator, new Date());
    revalidar(dados.enqueteId);
    return "Enquete encerrada. O time ainda pode registrar respostas.";
  });
}

/** "Reabrir" é alterar o "Fecha em" para uma data futura. */
export async function reabrirEnqueteAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  const agora = new Date();
  return executarAcao(form, alterarEnqueteSchema(agora), "disponibilidade.gerir", async (dados, ator) => {
    await alterarEnquete(dados, ator, agora);
    revalidar(dados.enqueteId);
    return dados.fechaEm ? `Enquete reaberta até ${diaEHora(dados.fechaEm)}.` : "Enquete alterada.";
  });
}

export async function registrarRespostaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarDisponibilidadeSchema, "disponibilidade.registrar_resposta", async (dados, ator) => {
    const resultado = await registrarDisponibilidade(dados, ator, new Date());
    revalidar(dados.enqueteId);
    if (resultado.gravadas + resultado.apagadas === 0) return `Nada mudou nas respostas de ${resultado.nome}.`;
    const respondidos = dados.respostas.filter((item) => item.resposta !== "SEM_RESPOSTA").length;
    const eventos = respondidos === 1 ? "1 evento" : `${respondidos} eventos`;
    return `Resposta de ${resultado.nome} registrada em ${eventos}${resultado.foraDoPrazo ? " (fora do prazo)" : ""}.`;
  });
}
