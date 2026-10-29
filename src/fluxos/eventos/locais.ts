import { bancoParaLeitura, RegraDeNegocioError, situacaoDaEscrita, transacao } from "@/fluxos/_base";
import {
  criarRepositorioLocal,
  type LocalCadastrado,
  motivoParaNaoArquivar,
  type SalvarLocal,
  type TipoDeLocal,
} from "@/modules/eventos";

// Configurações › Locais e hotéis (docs/07 §6.8). Sem geocodificação: lat/lng digitadas ou vazias.

/** O que a tela recebe (vai para o componente do navegador: sem Date). */
export type LocalNaTela = Omit<LocalCadastrado, "atualizadoEm"> & { atualizadoEm: string; motivoParaNaoArquivar: string | null };

export type LocaisCadastrados = { locais: LocalNaTela[]; escritaLiberada: boolean };

const LOCAL_SUMIU = "Este local não existe mais. Recarregue a página.";

export async function listarLocais(filtros: { tipo?: TipoDeLocal; busca?: string }): Promise<LocaisCadastrados> {
  const locais = await criarRepositorioLocal(await bancoParaLeitura()).listar(filtros);
  return {
    locais: locais.map((local) => ({ ...local, atualizadoEm: local.atualizadoEm.toISOString(), motivoParaNaoArquivar: motivoParaNaoArquivar(local.uso) })),
    escritaLiberada: (await situacaoDaEscrita()).liberada,
  };
}

/** Cria ou altera. Recusa outro local do mesmo tipo com o mesmo nome na mesma cidade. */
export async function salvarLocal({ localId, ...dados }: SalvarLocal, agora: Date): Promise<string> {
  return transacao(async (tx) => {
    const repo = criarRepositorioLocal(tx);
    if (await repo.existeComMesmoNome(dados, localId)) {
      throw new RegraDeNegocioError(`Já existe "${dados.nome}" em ${dados.cidade}/${dados.uf}. Edite o cadastro existente.`);
    }
    if (!localId) return repo.criar(dados, agora);
    if (!(await repo.alterar(localId, dados, agora))) throw new RegraDeNegocioError(LOCAL_SUMIU);
    return localId;
  });
}

/** Tira o local das listas (deleted_at). Local usado por evento ou hospedagem não sai. */
export async function arquivarLocal(localId: string, agora: Date): Promise<void> {
  await transacao(async (tx) => {
    const repo = criarRepositorioLocal(tx);
    const uso = await repo.travarUso(localId);
    if (!uso) throw new RegraDeNegocioError(LOCAL_SUMIU);
    const motivo = motivoParaNaoArquivar(uso);
    if (motivo) throw new RegraDeNegocioError(motivo);
    await repo.arquivar(localId, agora);
  });
}
