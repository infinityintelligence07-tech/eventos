"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  aprovarSolicitacao,
  corrigirSolicitacao,
  previaDaSolicitacao,
  type PreviaDaSolicitacao,
  reabrirAuditoria,
  registrarSolicitacao,
  reprovarSolicitacao,
} from "@/fluxos/custos";
import {
  aprovarSolicitacaoSchema,
  corrigirSolicitacaoSchema,
  deslocamentoSchema,
  type EntradaDeDeslocamento,
  type EntradaDeItem,
  itemSchema,
  reabrirAuditoriaSchema,
  registrarSolicitacaoSchema,
  reprovarSolicitacaoSchema,
} from "@/modules/custos";

import { executarAcao, type ResultadoAcao } from "../_servidor/acao";

function revalidarCustos(eventoId?: string) {
  revalidatePath("/custos", "layout");
  if (eventoId) revalidatePath(`/eventos/${eventoId}/custos`);
  revalidatePath("/inicio");
}

export async function registrarSolicitacaoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarSolicitacaoSchema, async (dados, usuario) => {
    const solicitacao = await registrarSolicitacao(dados, usuario.id, new Date());
    revalidarCustos(dados.eventoId);
    redirect(`/custos?protocolo=${solicitacao.protocolo}&registrada=1`);
  });
}

export async function corrigirSolicitacaoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, corrigirSolicitacaoSchema, async (dados, usuario) => {
    const solicitacao = await corrigirSolicitacao(dados, usuario.id, new Date());
    revalidarCustos(solicitacao.eventoId);
    redirect(`/custos?protocolo=${solicitacao.protocolo}&corrigida=1`);
  });
}

export async function aprovarSolicitacaoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, aprovarSolicitacaoSchema, async (dados, usuario) => {
    const solicitacao = await aprovarSolicitacao(dados, usuario.id, new Date());
    revalidarCustos(solicitacao.eventoId);
    return `${solicitacao.protocolo} aprovada. Seguiu para o financeiro.`;
  });
}

export async function reprovarSolicitacaoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, reprovarSolicitacaoSchema, async (dados, usuario) => {
    const solicitacao = await reprovarSolicitacao(dados, usuario.id, new Date());
    revalidarCustos(solicitacao.eventoId);
    return `${solicitacao.protocolo} reprovada. A pessoa pode corrigir e reenviar.`;
  });
}

export async function reabrirAuditoriaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, reabrirAuditoriaSchema, async (dados, usuario) => {
    const solicitacao = await reabrirAuditoria(dados, usuario.id, new Date());
    revalidarCustos(solicitacao.eventoId);
    return `Auditoria de ${solicitacao.protocolo} reaberta.`;
  });
}

const previaSchema = z.object({ eventoId: z.uuid(), deslocamentos: z.array(z.unknown()).max(10), itens: z.array(z.unknown()).max(20) });

export type PreviaNaTela = { previa: PreviaDaSolicitacao | null; deslocamentosValidos: boolean[]; itensValidos: boolean[] };

/** Resumo ao vivo do formulário (não grava). Linhas incompletas ficam fora da conta e voltam marcadas. */
export async function calcularPreviaAcao(entrada: unknown): Promise<PreviaNaTela> {
  const lido = previaSchema.safeParse(entrada);
  if (!lido.success) return { previa: null, deslocamentosValidos: [], itensValidos: [] };
  const deslocamentos = lido.data.deslocamentos.map((linha) => deslocamentoSchema.safeParse(linha));
  const itens = lido.data.itens.map((linha) => itemSchema.safeParse(linha));
  const validos = <T>(linhas: { success: boolean; data?: T }[]) => linhas.flatMap((linha) => (linha.success && linha.data !== undefined ? [linha.data] : []));
  const previa = await previaDaSolicitacao({
    eventoId: lido.data.eventoId,
    deslocamentos: validos<EntradaDeDeslocamento>(deslocamentos),
    itens: validos<EntradaDeItem>(itens),
  });
  return { previa, deslocamentosValidos: deslocamentos.map((linha) => linha.success), itensValidos: itens.map((linha) => linha.success) };
}
