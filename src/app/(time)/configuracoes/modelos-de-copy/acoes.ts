"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { executarAcao, executarLeitura, lerFormulario, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { definirModeloAtivo, previaDoModelo, type PreviaNaTela, salvarLinkDeCustos, salvarModelo } from "@/fluxos/comunicacao";
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
  return executarAcao(form, salvarLinkDeCustosSchema, "config.link_custos", async ({ linkCustos }, ator) => {
    await salvarLinkDeCustos(linkCustos ?? null, ator, new Date());
    revalidarCopys();
    return linkCustos
      ? "Link do formulário de custos salvo."
      : "Link do formulário de custos apagado. As copys de escalação ficam bloqueadas até ele ser preenchido.";
  });
}

export async function salvarModeloAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarModeloSchema, "config.modelos_copy", async (dados, ator) => {
    const salvo = await salvarModelo(dados, ator, new Date());
    revalidarCopys();
    if (!dados.modeloId) redirect(`/configuracoes/modelos-de-copy/${salvo.id}`);
    return salvo.ativo
      ? "Modelo salvo. Copys já enviadas não mudam; as ainda não enviadas usam o texto novo."
      : "Modelo salvo. Ele está inativo: a Comunicação continua usando o modelo ativo deste tipo.";
  });
}

export async function definirModeloAtivoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirModeloAtivoSchema, "config.modelos_copy", async ({ modeloId, ativo }, ator) => {
    await definirModeloAtivo(modeloId, ativo, ator, new Date());
    revalidarCopys();
    return ativo
      ? "Modelo ativado: a Comunicação passa a usá-lo (o anterior deste tipo foi desativado)."
      : "Modelo desativado. A Comunicação fica sem modelo deste tipo até outro ser ativado.";
  });
}

/** Só lê: funciona também com a escrita desligada (mas exige sessão e permissão). */
export async function previaDoModeloAcao(form: FormData): Promise<PreviaNaTela | { erro: string }> {
  const resultado = await executarLeitura("config.modelos_copy", async () => {
    const lido = lerFormulario(form, previaDoModeloSchema);
    return lido.ok ? await previaDoModelo(lido.dados, new Date()) : { erro: lido.erro };
  });
  return resultado.ok ? resultado.valor : { erro: resultado.erro };
}
