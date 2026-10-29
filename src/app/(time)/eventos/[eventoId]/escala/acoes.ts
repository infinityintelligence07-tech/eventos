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

import { executarAcao, type ResultadoAcao } from "../../../_servidor/acao";

// Montar escala (docs/07 §6.2). Toda action: Zod → usuário atual → fluxo → revalidatePath.

function atualizarTelas(eventoId: string) {
  revalidatePath(`/eventos/${eventoId}`, "layout");
  revalidatePath("/escalas");
  revalidatePath("/escalas/aprovacao");
  revalidatePath("/calendario");
  revalidatePath("/inicio");
}

const quem = (usuarioId: string) => ({ usuarioId, agora: new Date() });

export async function confirmarVagas(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, confirmarVagasSchema, async (dados, usuario) => {
    const { confirmadas } = await fluxo.confirmarVagas(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return confirmadas === 1 ? "Número de vagas confirmado." : `${confirmadas} funções confirmadas.`;
  });
}

export async function alterarVagas(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, alterarVagasSchema, async (dados, usuario) => {
    await fluxo.alterarVagas(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return "Número de vagas alterado. Confirme de novo antes de enviar.";
  });
}

export async function definirVagaDigitada(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirVagaDigitadaSchema, async (dados, usuario) => {
    await fluxo.definirVagaDigitada(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return "Número de vagas definido e confirmado.";
  });
}

export async function adicionarVagaManual(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, adicionarVagaManualSchema, async (dados, usuario) => {
    const { nomeDaFuncao } = await fluxo.adicionarVagaManual(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return `${nomeDaFuncao} adicionada à escala.`;
  });
}

export async function removerVagaManual(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, removerVagaManualSchema, async (dados, usuario) => {
    const { nomeDaFuncao } = await fluxo.removerVagaManual(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return `${nomeDaFuncao} removida da escala.`;
  });
}

export async function porNaVaga(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, porNaVagaSchema, async (dados, usuario) => {
    const { nome, nomeDaFuncao } = await fluxo.porNaVaga(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return `${nome} adicionada em ${nomeDaFuncao}.`;
  });
}

export async function tirarDaVaga(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, tirarDaVagaSchema, async (dados, usuario) => {
    const { nome, jaAvisada } = await fluxo.tirarDaVaga(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return jaAvisada ? `${nome} saiu da escala. Avise a pessoa.` : `${nome} saiu da escala.`;
  });
}

export async function atualizarConvocacao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, atualizarConvocacaoSchema, async (dados, usuario) => {
    await fluxo.atualizarConvocacao(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return "Deslocamento salvo.";
  });
}

export async function registrarRespostaDoStaff(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarRespostaDoStaffSchema, async (dados, usuario) => {
    const { nome } = await fluxo.registrarRespostaDoStaff(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return `Resposta de ${nome} registrada: ${dados.resposta === "ACEITA" ? "confirmou" : "não pode"}.`;
  });
}

export async function enviarParaAprovacao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, enviarParaAprovacaoSchema, async (dados, usuario) => {
    await fluxo.enviarParaAprovacao(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return "Escala enviada para aprovação.";
  });
}

export async function aprovarEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, aprovarEscalaSchema, async (dados, usuario) => {
    const { codigo } = await fluxo.aprovarEscala(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return `Escala ${codigo ?? "do evento"} aprovada.`;
  });
}

export async function devolverEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, devolverEscalaSchema, async (dados, usuario) => {
    const { codigo } = await fluxo.devolverEscala(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return `Escala ${codigo ?? "do evento"} devolvida.`;
  });
}

export async function reabrirEscala(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, reabrirEscalaSchema, async (dados, usuario) => {
    await fluxo.reabrirEscala(dados, quem(usuario.id));
    atualizarTelas(dados.eventoId);
    return "Escala reaberta. Depois das mudanças, envie para aprovação de novo.";
  });
}
