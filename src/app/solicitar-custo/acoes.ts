"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { lerFormulario } from "@/app/(time)/_servidor/formulario";
import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { logger } from "@/core/logging";
import { mensagemDoErro, RegraDeNegocioError } from "@/fluxos/_base";
import { type AtorDoStaff, corrigirMeuCusto, previaDoCustoDoStaff, solicitarCusto } from "@/fluxos/custos";
import { staffDaIdentidade } from "@/fluxos/pessoas";
import { caminhoDoFormularioDeCusto, corrigirMeuCustoSchema, deslocamentoSchema, despesaSchema, type EntradaDeDeslocamento, type EntradaDeDespesa, solicitarCustoSchema } from "@/modules/custos";

// Formulário de custo do próprio staff (docs/08 §11.4). Fora do (time): não pede perfil do Eventos, só que o usuário
// logado seja staff. Quem envia sai da sessão a cada envio; do formulário vêm só o evento e os valores.

export type ResultadoDoCusto = { ok: false; mensagem: string; erros?: Record<string, string> } | null;

type Sessao = { ok: true; ator: AtorDoStaff } | { ok: false; mensagem: string };

async function staffDaSessao(): Promise<Sessao> {
  const sessao = await identidadeDaSessao();
  if (!sessao) return { ok: false, mensagem: "Sua sessão terminou. Entre de novo." };
  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) return { ok: false, mensagem: "Seu usuário não está no cadastro de staff." };
  return { ok: true, ator: { usuarioId: staff.usuarioId, pessoaId: staff.pessoaId, origem: sessao.origem } };
}

function falha(erro: unknown): ResultadoDoCusto {
  // Recusa esperada (prazo, escala, duplicada) não é falha do sistema: não vai para o log de erro.
  if (!(erro instanceof RegraDeNegocioError)) logger.error({ componente: "solicitar-custo", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao gravar a solicitação de custo do staff");
  return { ok: false, mensagem: mensagemDoErro(erro) };
}

function revalidar(eventoId: string) {
  revalidatePath(caminhoDoFormularioDeCusto());
  revalidatePath(caminhoDoFormularioDeCusto(eventoId));
  revalidatePath("/custos", "layout");
  revalidatePath(`/eventos/${eventoId}/custos`);
  revalidatePath("/inicio");
}

const primeiraMensagem = (campos?: Record<string, string[]>) => Object.fromEntries(Object.entries(campos ?? {}).map(([campo, mensagens]) => [campo, mensagens[0] ?? ""]));

export async function solicitarCustoAcao(_anterior: ResultadoDoCusto, form: FormData): Promise<ResultadoDoCusto> {
  const sessao = await staffDaSessao();
  if (!sessao.ok) return sessao;
  const lido = lerFormulario(form, solicitarCustoSchema);
  if (!lido.ok) return { ok: false, mensagem: lido.erro, erros: primeiraMensagem(lido.campos) };

  try {
    await solicitarCusto(lido.dados, sessao.ator, new Date());
  } catch (erro: unknown) {
    return falha(erro);
  }
  revalidar(lido.dados.eventoId);
  redirect(`${caminhoDoFormularioDeCusto(lido.dados.eventoId)}?enviada=1`);
}

export async function corrigirMeuCustoAcao(_anterior: ResultadoDoCusto, form: FormData): Promise<ResultadoDoCusto> {
  const sessao = await staffDaSessao();
  if (!sessao.ok) return sessao;
  const lido = lerFormulario(form, corrigirMeuCustoSchema);
  if (!lido.ok) return { ok: false, mensagem: lido.erro, erros: primeiraMensagem(lido.campos) };

  try {
    await corrigirMeuCusto(lido.dados, sessao.ator, new Date());
  } catch (erro: unknown) {
    return falha(erro);
  }
  revalidar(lido.dados.eventoId);
  redirect(`${caminhoDoFormularioDeCusto(lido.dados.eventoId)}?corrigida=1`);
}

const previaSchema = z.object({ eventoId: z.uuid(), deslocamentos: z.array(z.unknown()).max(10), despesas: z.array(z.unknown()).max(10) });

export type PreviaDoStaff = {
  totalCentavos: number;
  kmTotal: number;
  /** Uma posição por deslocamento do formulário; nulo = linha ainda incompleta. */
  deslocamentos: ({ combustivelCentavos: number; pedagioCentavos: number; depreciacaoCentavos: number; totalCentavos: number; avisos: string[] } | null)[];
} | null;

/** Resumo ao vivo do formulário (não grava). Linhas incompletas ficam fora da conta. */
export async function calcularPreviaDoStaffAcao(entrada: unknown): Promise<PreviaDoStaff> {
  const sessao = await staffDaSessao();
  if (!sessao.ok) return null;
  const lido = previaSchema.safeParse(entrada);
  if (!lido.success) return null;
  const deslocamentos = lido.data.deslocamentos.map((linha) => deslocamentoSchema.safeParse(linha));
  const despesas = lido.data.despesas.map((linha) => despesaSchema.safeParse(linha));
  const validos = <T>(linhas: { success: boolean; data?: T }[]) => linhas.flatMap((linha) => (linha.success && linha.data !== undefined ? [linha.data] : []));
  try {
    const previa = await previaDoCustoDoStaff({ eventoId: lido.data.eventoId, deslocamentos: validos<EntradaDeDeslocamento>(deslocamentos), despesas: validos<EntradaDeDespesa>(despesas) });
    if (!previa) return null;
    let proximo = 0;
    return {
      totalCentavos: previa.totalCentavos,
      kmTotal: previa.kmTotal,
      deslocamentos: deslocamentos.map((linha) => {
        const calculado = linha.success ? previa.deslocamentos[proximo++] : undefined;
        if (!calculado) return null;
        const { alertas, ...valores } = calculado;
        return { ...valores, avisos: alertas.map((alerta) => alerta.mensagem) };
      }),
    };
  } catch {
    return null;
  }
}
