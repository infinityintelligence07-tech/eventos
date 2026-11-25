"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { definirAcessoDaSdc, incluirAcessoDaSdc } from "@/fluxos/sdc";
import { definirAcessoDaSdcSchema, incluirAcessoDaSdcSchema } from "@/modules/logistica";

// Configurações › Acesso da SDC (docs/09 §15): só a líder inclui, desativa e reativa os e-mails da agência.

export async function incluirAcessoDaSdcAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, incluirAcessoDaSdcSchema, "config.acesso_da_sdc", async (dados, ator) => {
    await incluirAcessoDaSdc(dados, ator, new Date());
    revalidatePath("/configuracoes/acesso-da-sdc");
    return `${dados.nome} incluída na lista da SDC. A pessoa entra com o Google usando este e-mail e só vê a área da SDC.`;
  });
}

export async function definirAcessoDaSdcAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirAcessoDaSdcSchema, "config.acesso_da_sdc", async (dados, ator) => {
    const { mudou, nome } = await definirAcessoDaSdc(dados, ator, new Date());
    revalidatePath("/configuracoes/acesso-da-sdc");
    if (!mudou) return `O acesso de ${nome} já estava assim.`;
    return dados.ativo ? `Acesso de ${nome} reativado.` : `Acesso de ${nome} desativado. Vale no próximo carregamento de tela da pessoa.`;
  });
}
