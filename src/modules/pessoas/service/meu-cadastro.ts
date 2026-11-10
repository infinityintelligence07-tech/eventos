import { camposAlterados } from "../domain/auditoria";
import { FuncaoInvalidaError, PessoaNaoEncontradaError } from "../domain/cadastro";
import { type FuncaoDoStaff, funcoesDepoisDoStaff, type MeuCadastro } from "../domain/meu-cadastro";
import type { Autoria, RepositorioPerfil } from "./perfil";

// "Meu cadastro" (docs/10): uma transação com tudo o que o staff preencheu. O registro_acao guarda só os nomes dos
// campos que mudaram (nunca valores: sexo, camiseta, polo e local são dados pessoais).

export type LocalDoStaff = { poloId: string | null; cep: string | null; cidade: string | null; uf: string | null };

export type RepositorioMeuCadastro = RepositorioPerfil & {
  poloPorCodigo(codigo: string): Promise<string | null>;
  funcoesComId(pessoaId: string): Promise<FuncaoDoStaff[]>;
  localAtual(pessoaId: string): Promise<LocalDoStaff | null>;
  /** Coordenadas nulas = mantém as que já existem. */
  salvarLocal(dados: LocalDoStaff & { pessoaId: string; coordenadas: { lat: number; lng: number } | null; instante: Date }): Promise<void>;
  marcarRevisado(pessoaId: string, instante: Date): Promise<void>;
};

export class PoloInvalidoError extends Error {
  constructor() {
    super("polo inexistente ou inativo");
    this.name = "PoloInvalidoError";
  }
}

export type AtualizarMeuCadastro = MeuCadastro & { pessoaId: string; coordenadas: { lat: number; lng: number } | null };

export async function atualizarMeuCadastro(repo: RepositorioMeuCadastro, dados: AtualizarMeuCadastro, { usuarioId, instante }: Autoria): Promise<{ nome: string }> {
  const pessoa = await repo.travarStaff(dados.pessoaId);
  if (!pessoa) throw new PessoaNaoEncontradaError(dados.pessoaId);
  const { pessoaId } = dados;

  const poloId = await repo.poloPorCodigo(dados.poloCodigo);
  if (!poloId) throw new PoloInvalidoError();
  const ativas = new Set(await repo.funcoesAtivas(dados.funcoes));
  const invalidas = dados.funcoes.filter((funcaoId) => !ativas.has(funcaoId));
  if (invalidas.length > 0) throw new FuncaoInvalidaError(invalidas);

  // Perfil: só o que o staff vê no formulário; o resto (fez Confronto, CNPJ, já tem camiseta) é do time.
  const perfilAntes = await repo.perfilAtual(pessoaId);
  const perfil = { sexo: dados.sexo, camisetaModelo: dados.camisetaModelo, camisetaTamanho: dados.camisetaTamanho };
  const campos = camposAlterados(perfilAntes, perfil);
  await repo.salvarPerfil({
    pessoaId,
    ...perfil,
    possuiCamiseta: (perfilAntes?.possuiCamiseta as boolean | null | undefined) ?? null,
    fezConfronto: (perfilAntes?.fezConfronto as boolean | null | undefined) ?? null,
    temCnpj: (perfilAntes?.temCnpj as boolean | null | undefined) ?? null,
    instante,
  });

  const funcoesAntes = await repo.funcoesComId(pessoaId);
  const funcoes = funcoesDepoisDoStaff(funcoesAntes, dados.funcoes);
  const chave = (lista: FuncaoDoStaff[]) => lista.map((funcao) => `${funcao.funcaoId}:${funcao.nivel}`).sort().join(",");
  if (chave(funcoesAntes) !== chave(funcoes)) {
    await repo.substituirFuncoes(pessoaId, funcoes);
    campos.push("funcoes");
  }

  const veiculoAntes = await repo.veiculoAtual(pessoaId);
  if (dados.temCarro === "SIM") {
    const veiculo = { lugares: dados.lugares ?? 1, consumoKmL: dados.consumoKmL };
    campos.push(...camposAlterados(veiculoAntes, veiculo).map((campo) => `veiculo.${campo}`));
    await repo.salvarVeiculo({ pessoaId, ...veiculo, instante });
  } else if (veiculoAntes) {
    campos.push("veiculo");
    await repo.removerVeiculo(pessoaId);
  }

  const local = { poloId, cep: dados.cep, cidade: dados.cidade, uf: dados.uf };
  campos.push(...camposAlterados(await repo.localAtual(pessoaId), local));
  if (dados.coordenadas) campos.push("localizacao");
  await repo.salvarLocal({ pessoaId, ...local, coordenadas: dados.coordenadas, instante });

  await repo.marcarRevisado(pessoaId, instante);
  await repo.registrar({ pessoaId, acao: "CADASTRO_REVISADO", usuarioId, dados: { campos, pelaPropriaPessoa: true } });
  return pessoa;
}
