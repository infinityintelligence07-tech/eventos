"use server";

import { revalidatePath } from "next/cache";

import { executarAcao, type ResultadoAcao } from "@/app/(time)/_servidor/acao";
import { definirFuncoes, salvarCoordenadas, salvarPerfilDoStaff, salvarVeiculo } from "@/fluxos/pessoas";
import { definirFuncoesSchema, salvarCoordenadasSchema, salvarPerfilDoStaffSchema, salvarVeiculoSchema } from "@/modules/pessoas";

function revalidar(pessoaId: string) {
  revalidatePath("/pessoas");
  revalidatePath(`/pessoas/${pessoaId}`);
}

export async function salvarPerfilAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarPerfilDoStaffSchema, "pessoas.editar", async (dados, ator) => {
    const { nome } = await salvarPerfilDoStaff(dados, ator, new Date());
    revalidar(dados.pessoaId);
    return `Camiseta e experiência de ${nome} atualizadas.`;
  });
}

export async function definirFuncoesAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirFuncoesSchema, "pessoas.editar", async (dados, ator) => {
    const { nome } = await definirFuncoes(dados, ator, new Date());
    revalidar(dados.pessoaId);
    return `Funções de ${nome} atualizadas.`;
  });
}

export async function salvarVeiculoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarVeiculoSchema, "pessoas.editar", async (dados, ator) => {
    const { nome, temCarro } = await salvarVeiculo(dados, ator, new Date());
    revalidar(dados.pessoaId);
    return temCarro ? `Veículo de ${nome} atualizado.` : `${nome} ficou sem carro cadastrado.`;
  });
}

export async function salvarCoordenadasAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, salvarCoordenadasSchema, "pessoas.editar", async (dados, ator) => {
    const { nome } = await salvarCoordenadas(dados, ator, new Date());
    revalidar(dados.pessoaId);
    return `Localização de ${nome} atualizada.`;
  });
}
