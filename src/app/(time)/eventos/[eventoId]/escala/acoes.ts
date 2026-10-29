"use server";

import { revalidatePath } from "next/cache";

import * as fluxo from "@/fluxos/escalas";
import {
  adicionarVagaManualSchema,
  alterarVagasSchema,
  aprovarEscalaSchema,
  atualizarConvocacaoSchema,
  confirmarVagasSchema,
  definirVagaDigitadaSchema,
  devolverEscalaSchema,
  enviarParaAprovacaoSchema,
  porNaVagaSchema,
  reabrirEscalaSchema,
  registrarRespostaDoStaffSchema,
  removerVagaManualSchema,
  tirarDaVagaSchema,
} from "@/modules/escala";

import { type Ator, executarAcao, type ResultadoAcao } from "../../../_servidor/acao";

// Montar escala (docs/07 §6.2). Toda action: Zod → usuário atual → fluxo → revalidatePath.

function atualizarTelas(eventoId: string) {
  revalidatePath(`/eventos/${eventoId}`, "layout");
  revalidatePath("/escalas");
  revalidatePath("/escalas/aprovacao");
  revalidatePath("/calendario");
  revalidatePath("/inicio");
}

const quem = (ator: Ator) => ({ ator, agora: new Date() });

export async function confirmarVagas(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, confirmarVagasSchema, "escala.montar", async (dados, ator) => {
    const { confirmadas } = await fluxo.confirmarVagas(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return confirmadas === 1 ? "Número de vagas confirmado." : `${confirmadas} funções confirmadas.`;
  });
}

export async function alterarVagas(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, alterarVagasSchema, "escala.montar", async (dados, ator) => {
    await fluxo.alterarVagas(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return "Número de vagas alterado. Confirme de novo antes de enviar.";
  });
}

export async function definirVagaDigitada(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirVagaDigitadaSchema, "escala.montar", async (dados, ator) => {
    await fluxo.definirVagaDigitada(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return "Número de vagas definido e confirmado.";
  });
}

export async function adicionarVagaManual(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, adicionarVagaManualSchema, "escala.montar", async (dados, ator) => {
    const { nomeDaFuncao } = await fluxo.adicionarVagaManual(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return `${nomeDaFuncao} adicionada à escala.`;
  });
}

export async function removerVagaManual(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, removerVagaManualSchema, "escala.montar", async (dados, ator) => {
    const { nomeDaFuncao } = await fluxo.removerVagaManual(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return `${nomeDaFuncao} removida da escala.`;
  });
}

export async function porNaVaga(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, porNaVagaSchema, "escala.montar", async (dados, ator) => {
    const { nome, nomeDaFuncao } = await fluxo.porNaVaga(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return `${nome} adicionada em ${nomeDaFuncao}.`;
  });
}

export async function tirarDaVaga(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, tirarDaVagaSchema, "escala.montar", async (dados, ator) => {
    const { nome, jaAvisada } = await fluxo.tirarDaVaga(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return jaAvisada ? `${nome} saiu da escala. Avise a pessoa.` : `${nome} saiu da escala.`;
  });
}

export async function atualizarConvocacao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, atualizarConvocacaoSchema, "escala.montar", async (dados, ator) => {
    await fluxo.atualizarConvocacao(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return "Deslocamento salvo.";
  });
}

export async function registrarRespostaDoStaff(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarRespostaDoStaffSchema, "escala.registrar_resposta", async (dados, ator) => {
    const { nome } = await fluxo.registrarRespostaDoStaff(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return `Resposta de ${nome} registrada: ${dados.resposta === "ACEITA" ? "confirmou" : "não pode"}.`;
  });
}

export async function enviarParaAprovacao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, enviarParaAprovacaoSchema, "escala.montar", async (dados, ator) => {
    await fluxo.enviarParaAprovacao(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return "Escala enviada para aprovação.";
  });
}

export async function aprovarEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, aprovarEscalaSchema, "escala.aprovar", async (dados, ator) => {
    const { codigo } = await fluxo.aprovarEscala(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return `Escala ${codigo ?? "do evento"} aprovada.`;
  });
}

export async function devolverEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, devolverEscalaSchema, "escala.aprovar", async (dados, ator) => {
    const { codigo } = await fluxo.devolverEscala(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return `Escala ${codigo ?? "do evento"} devolvida.`;
  });
}

export async function reabrirEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, reabrirEscalaSchema, "escala.reabrir", async (dados, ator) => {
    await fluxo.reabrirEscala(dados, quem(ator));
    atualizarTelas(dados.eventoId);
    return "Escala reaberta. Depois das mudanças, envie para aprovação de novo.";
  });
}
