"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { definirAcessoDoTime } from "@/fluxos/pessoas";
import { definirAcessoSchema, rotuloDoNivelDeAcesso } from "@/modules/pessoas";

export async function definirAcessoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirAcessoSchema, "config.acesso_do_time", async (dados, ator) => {
    const { de, para } = await definirAcessoDoTime(dados, ator);
    revalidatePath("/configuracoes/acesso");
    if (para === "SEM_ACESSO") return "Acesso retirado. Vale no próximo carregamento de tela da pessoa.";
    return de === "SEM_ACESSO"
      ? `Acesso liberado como ${rotuloDoNivelDeAcesso(para)}. A pessoa entra com a conta do IAM Control.`
      : `Acesso alterado para ${rotuloDoNivelDeAcesso(para)}.`;
  });
}
