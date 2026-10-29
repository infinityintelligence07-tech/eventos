import { type Executor, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import {
  criarRepositorioPerfil,
  type DefinirFuncoes,
  definirFuncoes as definirFuncoesNoModulo,
  FuncaoInvalidaError,
  PessoaNaoEncontradaError,
  type SalvarCoordenadas,
  salvarCoordenadas as salvarCoordenadasNoModulo,
  type SalvarPerfilDoStaff,
  salvarPerfilDoStaff as salvarPerfilNoModulo,
  type SalvarVeiculo,
  salvarVeiculo as salvarVeiculoNoModulo,
} from "@/modules/pessoas";

// Nenhuma tabela do staff tem coluna de autoria: o fluxo não recebe o usuário (docs/07 §6.5).

async function emTransacao<T>(trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  try {
    return await transacao(trabalho);
  } catch (erro: unknown) {
    if (erro instanceof PessoaNaoEncontradaError) throw new RegraDeNegocioError("Pessoa não encontrada.");
    if (erro instanceof FuncaoInvalidaError) throw new RegraDeNegocioError("Alguma função escolhida não existe mais. Recarregue a página.");
    throw erro;
  }
}

export function salvarPerfilDoStaff(dados: SalvarPerfilDoStaff, agora: Date): Promise<{ nome: string }> {
  return emTransacao((tx) => salvarPerfilNoModulo(criarRepositorioPerfil(tx), dados, agora));
}

export function definirFuncoes(dados: DefinirFuncoes): Promise<{ nome: string; quantidade: number }> {
  return emTransacao((tx) => definirFuncoesNoModulo(criarRepositorioPerfil(tx), dados));
}

/** Sem carro remove o veículo. */
export function salvarVeiculo(dados: SalvarVeiculo, agora: Date): Promise<{ nome: string; temCarro: boolean }> {
  return emTransacao((tx) => salvarVeiculoNoModulo(criarRepositorioPerfil(tx), dados, agora));
}

export function salvarCoordenadas(dados: SalvarCoordenadas, agora: Date): Promise<{ nome: string }> {
  return emTransacao((tx) => salvarCoordenadasNoModulo(criarRepositorioPerfil(tx), dados, agora));
}
