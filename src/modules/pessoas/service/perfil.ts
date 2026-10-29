import { camposAlterados } from "../domain/auditoria";
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
  perfilAtual(pessoaId: string): Promise<Record<string, unknown> | null>;
  /** Código e nível das funções da pessoa (para o de/para do registro). */
  funcoesDaPessoa(pessoaId: string): Promise<{ codigo: string; nivel: string }[]>;
  veiculoAtual(pessoaId: string): Promise<{ lugares: number; consumoKmL: number | null } | null>;
  /** registro_acao PESSOA. `dados` nunca leva valor de dado pessoal (só nomes de campos). */
  registrar(dados: { pessoaId: string; acao: AcaoNoCadastro; usuarioId: string; dados: Record<string, unknown> }): Promise<void>;
};

export type AcaoNoCadastro = "PERFIL_ALTERADO" | "COORDENADAS_ALTERADAS" | "FUNCOES_DEFINIDAS" | "VEICULO_SALVO" | "VEICULO_REMOVIDO";

export type Autoria = { usuarioId: string; instante: Date };

async function staff(repo: RepositorioPerfil, pessoaId: string): Promise<{ nome: string }> {
  const encontrado = await repo.travarStaff(pessoaId);
  if (!encontrado) throw new PessoaNaoEncontradaError(pessoaId);
  return encontrado;
}

export async function salvarPerfilDoStaff(repo: RepositorioPerfil, dados: SalvarPerfilDoStaff, { usuarioId, instante }: Autoria): Promise<{ nome: string }> {
  const pessoa = await staff(repo, dados.pessoaId);
  const { pessoaId, ...perfil } = dados;
  const campos = camposAlterados(await repo.perfilAtual(pessoaId), perfil);
  await repo.salvarPerfil({ ...dados, instante });
  await repo.registrar({ pessoaId, acao: "PERFIL_ALTERADO", usuarioId, dados: { campos } });
  return pessoa;
}

export async function definirFuncoes(repo: RepositorioPerfil, { pessoaId, funcoes }: DefinirFuncoes, { usuarioId }: Autoria): Promise<{ nome: string; quantidade: number }> {
  const pessoa = await staff(repo, pessoaId);
  const pedidas = funcoes.map((funcao) => funcao.funcaoId);
  const ativas = new Set(await repo.funcoesAtivas(pedidas));
  const invalidas = pedidas.filter((funcaoId) => !ativas.has(funcaoId));
  if (invalidas.length > 0) throw new FuncaoInvalidaError(invalidas);
  const de = await repo.funcoesDaPessoa(pessoaId);
  await repo.substituirFuncoes(pessoaId, funcoes);
  await repo.registrar({ pessoaId, acao: "FUNCOES_DEFINIDAS", usuarioId, dados: { de, para: await repo.funcoesDaPessoa(pessoaId) } });
  return { nome: pessoa.nome, quantidade: funcoes.length };
}

export async function salvarVeiculo(repo: RepositorioPerfil, dados: SalvarVeiculo, { usuarioId, instante }: Autoria): Promise<{ nome: string; temCarro: boolean }> {
  const pessoa = await staff(repo, dados.pessoaId);
  const de = await repo.veiculoAtual(dados.pessoaId);
  switch (dados.temCarro) {
    case "SIM": {
      const para = { lugares: dados.lugares, consumoKmL: dados.consumoKmL };
      await repo.salvarVeiculo({ pessoaId: dados.pessoaId, ...para, instante });
      await repo.registrar({ pessoaId: dados.pessoaId, acao: "VEICULO_SALVO", usuarioId, dados: { campos: camposAlterados(de, para) } });
      return { nome: pessoa.nome, temCarro: true };
    }
    case "NAO":
      await repo.removerVeiculo(dados.pessoaId);
      await repo.registrar({ pessoaId: dados.pessoaId, acao: "VEICULO_REMOVIDO", usuarioId, dados: {} });
      return { nome: pessoa.nome, temCarro: false };
    default: {
      const desconhecido: never = dados;
      throw new Error(`veículo desconhecido: ${JSON.stringify(desconhecido)}`);
    }
  }
}

/** As coordenadas da casa não entram no registro (docs/09 §9.1). */
export async function salvarCoordenadas(repo: RepositorioPerfil, dados: SalvarCoordenadas, { usuarioId, instante }: Autoria): Promise<{ nome: string }> {
  const pessoa = await staff(repo, dados.pessoaId);
  await repo.salvarCoordenadas({ ...dados, instante });
  await repo.registrar({ pessoaId: dados.pessoaId, acao: "COORDENADAS_ALTERADAS", usuarioId, dados: {} });
  return pessoa;
}
