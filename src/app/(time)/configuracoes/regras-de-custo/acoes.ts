"use server";

import { revalidatePath } from "next/cache";

import { criarVigenciaDeRegra, desativarRegra } from "@/fluxos/custos";
import { criarVigenciaDeRegraSchema, desativarRegraSchema } from "@/modules/custos";

import { executarAcao, type ResultadoAcao } from "../../_servidor/acao";

function dataCurta(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

function revalidarRegras() {
  revalidatePath("/configuracoes/regras-de-custo");
  revalidatePath("/custos", "layout");
}

export async function criarVigenciaDeRegraAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, criarVigenciaDeRegraSchema, async (dados, usuario) => {
    const regra = await criarVigenciaDeRegra(dados, usuario.id, new Date());
    revalidarRegras();
    return `Novo valor de ${regra.nome} vale a partir de ${dataCurta(regra.vigenteDesde)}.`;
  });
}

export async function desativarRegraAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, desativarRegraSchema, async (dados, usuario) => {
    const regra = await desativarRegra(dados.regraId, usuario.id, new Date());
    revalidarRegras();
    return `${regra.nome} desativada.`;
  });
}
