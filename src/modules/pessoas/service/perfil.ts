import { FuncaoInvalidaError, PessoaNaoEncontradaError } from "../domain/cadastro";
import type { DefinirFuncoes, SalvarCoordenadas, SalvarPerfilDoStaff, SalvarVeiculo } from "../domain/schemas";

/** Tudo roda no executor recebido (a transação do fluxo). `travarStaff` trava a linha de pessoa_evento. */
export type RepositorioPerfil = {
  /** Nome do staff (com pessoa_evento); nulo se não for staff. */
  travarStaff(pessoaId: string): Promise<{ nome: string } | null>;
  funcoesAtivas(funcaoIds: string[]): Promise<string[]>;
  salvarPerfil(dados: Omit<SalvarPerfilDoStaff, "pessoaId"> & { pessoaId: string; instante: Date }): Promise<void>;
  substituirFuncoes(pessoaId: string, funcoes: DefinirFuncoes["funcoes"]): Promise<void>;
  salvarVeiculo(dados: { pessoaId: string; lugares: number; consumoKmL: number | null; instante: Date }): Promise<void>;
  removerVeiculo(pessoaId: string): Promise<void>;
  salvarCoordenadas(dados: SalvarCoordenadas & { instante: Date }): Promise<void>;
};

async function staff(repo: RepositorioPerfil, pessoaId: string): Promise<{ nome: string }> {
  const encontrado = await repo.travarStaff(pessoaId);
  if (!encontrado) throw new PessoaNaoEncontradaError(pessoaId);
  return encontrado;
}

export async function salvarPerfilDoStaff(repo: RepositorioPerfil, dados: SalvarPerfilDoStaff, instante: Date): Promise<{ nome: string }> {
  const pessoa = await staff(repo, dados.pessoaId);
  await repo.salvarPerfil({ ...dados, instante });
  return pessoa;
}

export async function definirFuncoes(repo: RepositorioPerfil, { pessoaId, funcoes }: DefinirFuncoes): Promise<{ nome: string; quantidade: number }> {
  const pessoa = await staff(repo, pessoaId);
  const pedidas = funcoes.map((funcao) => funcao.funcaoId);
  const ativas = new Set(await repo.funcoesAtivas(pedidas));
  const invalidas = pedidas.filter((funcaoId) => !ativas.has(funcaoId));
  if (invalidas.length > 0) throw new FuncaoInvalidaError(invalidas);
  await repo.substituirFuncoes(pessoaId, funcoes);
  return { nome: pessoa.nome, quantidade: funcoes.length };
}

export async function salvarVeiculo(repo: RepositorioPerfil, dados: SalvarVeiculo, instante: Date): Promise<{ nome: string; temCarro: boolean }> {
  const pessoa = await staff(repo, dados.pessoaId);
  switch (dados.temCarro) {
    case "SIM":
      await repo.salvarVeiculo({ pessoaId: dados.pessoaId, lugares: dados.lugares, consumoKmL: dados.consumoKmL, instante });
      return { nome: pessoa.nome, temCarro: true };
    case "NAO":
      await repo.removerVeiculo(dados.pessoaId);
      return { nome: pessoa.nome, temCarro: false };
    default: {
      const desconhecido: never = dados;
      throw new Error(`veículo desconhecido: ${JSON.stringify(desconhecido)}`);
    }
  }
}

export async function salvarCoordenadas(repo: RepositorioPerfil, dados: SalvarCoordenadas, instante: Date): Promise<{ nome: string }> {
  const pessoa = await staff(repo, dados.pessoaId);
  await repo.salvarCoordenadas({ ...dados, instante });
  return pessoa;
}
