import { type AtorDaEscrita, type Executor, RegraDeNegocioError, transacao } from "@/fluxos/_base";
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

// As tabelas do staff não têm coluna de autoria: quem mexeu fica no registro_acao (PESSOA), sem os valores.

async function emTransacao<T>(ator: AtorDaEscrita, trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  try {
    return await transacao(ator, trabalho);
  } catch (erro: unknown) {
    if (erro instanceof PessoaNaoEncontradaError) throw new RegraDeNegocioError("Pessoa não encontrada.");
    if (erro instanceof FuncaoInvalidaError) throw new RegraDeNegocioError("Alguma função escolhida não existe mais. Recarregue a página.");
    throw erro;
  }
}

export function salvarPerfilDoStaff(dados: SalvarPerfilDoStaff, ator: AtorDaEscrita, agora: Date): Promise<{ nome: string }> {
  return emTransacao(ator, (tx) => salvarPerfilNoModulo(criarRepositorioPerfil(tx), dados, { usuarioId: ator.usuarioId, instante: agora }));
}

export function definirFuncoes(dados: DefinirFuncoes, ator: AtorDaEscrita, agora: Date): Promise<{ nome: string; quantidade: number }> {
  return emTransacao(ator, (tx) => definirFuncoesNoModulo(criarRepositorioPerfil(tx), dados, { usuarioId: ator.usuarioId, instante: agora }));
}

/** Sem carro remove o veículo. */
export function salvarVeiculo(dados: SalvarVeiculo, ator: AtorDaEscrita, agora: Date): Promise<{ nome: string; temCarro: boolean }> {
  return emTransacao(ator, (tx) => salvarVeiculoNoModulo(criarRepositorioPerfil(tx), dados, { usuarioId: ator.usuarioId, instante: agora }));
}

export function salvarCoordenadas(dados: SalvarCoordenadas, ator: AtorDaEscrita, agora: Date): Promise<{ nome: string }> {
  return emTransacao(ator, (tx) => salvarCoordenadasNoModulo(criarRepositorioPerfil(tx), dados, { usuarioId: ator.usuarioId, instante: agora }));
}
