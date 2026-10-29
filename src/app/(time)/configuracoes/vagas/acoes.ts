"use server";

import { revalidatePath } from "next/cache";

import { recalcularVagasDoTipo as recalcularNoFluxo, salvarRegraDeVagas as salvarNoFluxo } from "@/fluxos/escalas";
import { recalcularVagasDoTipoSchema, salvarRegraDeVagasSchema } from "@/modules/escala";

import { executarAcao, type ResultadoAcao } from "../../_servidor/acao";

export async function salvarRegraDeVagas(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarRegraDeVagasSchema, "config.regras_vagas", async (dados, ator) => {
    const { nome } = await salvarNoFluxo(dados, { ator, agora: new Date() });
    revalidatePath("/configuracoes/vagas");
    return `Regra de vagas de ${nome} salva. Use "Recalcular vagas" para aplicar aos eventos em montagem.`;
  });
}

export async function recalcularVagasDoTipo(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, recalcularVagasDoTipoSchema, "config.regras_vagas", async (dados, ator) => {
    const { eventos, alterados } = await recalcularNoFluxo(dados, { ator, agora: new Date() });
    revalidatePath("/configuracoes/vagas");
    revalidatePath("/escalas");
    revalidatePath("/calendario");
    revalidatePath("/eventos", "layout");
    if (eventos === 0) return "Nenhum evento deste tipo em montagem para recalcular.";
    return `${eventos} ${eventos === 1 ? "evento conferido" : "eventos conferidos"}; ${alterados} com vagas alteradas. Números confirmados não mudaram.`;
  });
}
