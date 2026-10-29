"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { executarAcao, lerFormulario, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { definirModeloAtivo, previaDoModelo, type PreviaNaTela, salvarLinkDeCustos, salvarModelo } from "@/fluxos/comunicacao";
import { mensagemDoErro } from "@/fluxos/_base";
import {
  definirModeloAtivoSchema,
  previaDoModeloSchema,
  salvarLinkDeCustosSchema,
  salvarModeloSchema,
} from "@/modules/comunicacao";

/** Modelos e o link de custos mudam as copys de todas as telas de Comunicação. */
function revalidarCopys() {
  revalidatePath("/configuracoes/modelos-de-copy", "layout");
  revalidatePath("/comunicacao");
  revalidatePath("/eventos/[eventoId]/comunicacao", "page");
  revalidatePath("/inicio");
}

export async function salvarLinkDeCustosAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarLinkDeCustosSchema, async ({ linkCustos }, usuario) => {
    await salvarLinkDeCustos(linkCustos ?? null, usuario.id, new Date());
    revalidarCopys();
    return linkCustos
      ? "Link do formulário de custos salvo."
      : "Link do formulário de custos apagado. As copys de escalação ficam bloqueadas até ele ser preenchido.";
  });
}

export async function salvarModeloAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarModeloSchema, async (dados, usuario) => {
    const salvo = await salvarModelo(dados, usuario.id, new Date());
    revalidarCopys();
    if (!dados.modeloId) redirect(`/configuracoes/modelos-de-copy/${salvo.id}`);
    return salvo.ativo
      ? "Modelo salvo. Copys já enviadas não mudam; as ainda não enviadas usam o texto novo."
      : "Modelo salvo. Ele está inativo: a Comunicação continua usando o modelo ativo deste tipo.";
  });
}

export async function definirModeloAtivoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirModeloAtivoSchema, async ({ modeloId, ativo }, usuario) => {
    await definirModeloAtivo(modeloId, ativo, usuario.id, new Date());
    revalidarCopys();
    return ativo
      ? "Modelo ativado: a Comunicação passa a usá-lo (o anterior deste tipo foi desativado)."
      : "Modelo desativado. A Comunicação fica sem modelo deste tipo até outro ser ativado.";
  });
}

/** Só lê: funciona também com a escrita desligada. */
export async function previaDoModeloAcao(form: FormData): Promise<PreviaNaTela | { erro: string }> {
  const lido = lerFormulario(form, previaDoModeloSchema);
  if (!lido.ok) return { erro: lido.erro };
  try {
    return await previaDoModelo(lido.dados, new Date());
  } catch (erro: unknown) {
    return { erro: mensagemDoErro(erro) };
  }
}
