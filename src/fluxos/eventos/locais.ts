import { type AtorDaEscrita, bancoParaLeitura, RegraDeNegocioError, situacaoDaEscrita, transacao } from "@/fluxos/_base";
import {
  type AjustarLocalDoIamControl,
  chaveDoLocal,
  criarRepositorioLocal,
  type LocalCadastrado,
  motivoParaNaoArquivar,
  mudancasDoLocal,
  type OrigemDoLocal,
  rotuloDoTipoDeLocal,
  type SalvarLocal,
  type TipoDeLocal,
} from "@/modules/eventos";

// Configurações › Locais e hotéis (docs/07 §6.8). Sem geocodificação: lat/lng digitadas ou vazias.
// A base vem do IAM Control (sincronização de turmas); aqui o time cadastra o que não existe lá e, no que veio de lá,
// muda só o que é do Eventos (tipo, complemento, capacidade e localização no mapa).

/** O que a tela recebe (vai para o componente do navegador: sem Date). */
export type LocalNaTela = Omit<LocalCadastrado, "atualizadoEm"> & { atualizadoEm: string; motivoParaNaoArquivar: string | null };

export type LocaisCadastrados = { locais: LocalNaTela[]; escritaLiberada: boolean };

const LOCAL_SUMIU = "Este local não existe mais. Recarregue a página.";
const VEM_DO_IAM_CONTROL = "Este local vem do IAM Control: nome e endereço mudam lá. Recarregue a página.";
const NAO_VEM_DO_IAM_CONTROL = "Este local não vem do IAM Control. Recarregue a página.";
const TIPO_COM_HOSPEDAGEM = "Este local tem hospedagem: o tipo não muda enquanto ela existir.";

export async function listarLocais(filtros: { tipo?: TipoDeLocal; origem?: OrigemDoLocal; busca?: string }): Promise<LocaisCadastrados> {
  const locais = await criarRepositorioLocal(await bancoParaLeitura()).listar(filtros);
  return {
    locais: locais.map((local) => ({ ...local, atualizadoEm: local.atualizadoEm.toISOString(), motivoParaNaoArquivar: motivoParaNaoArquivar(local.uso) })),
    escritaLiberada: (await situacaoDaEscrita()).liberada,
  };
}

/**
 * Cria ou altera um cadastro do Eventos. Recusa outro local do mesmo tipo com o mesmo nome na mesma cidade, e também o
 * lugar que já veio do IAM Control (local de evento ou hotel): esse não se cadastra de novo, ajusta-se o que veio.
 */
export async function salvarLocal({ localId, ...dados }: SalvarLocal, ator: AtorDaEscrita, agora: Date): Promise<string> {
  return transacao(ator, async (tx) => {
    const repo = criarRepositorioLocal(tx);
    const antes = localId ? await repo.local(localId) : null;
    if (localId && !antes) throw new RegraDeNegocioError(LOCAL_SUMIU);
    if (antes?.origem === "IAM_CONTROL") throw new RegraDeNegocioError(VEM_DO_IAM_CONTROL);
    if (await repo.existeComMesmoNome(dados, localId)) {
      throw new RegraDeNegocioError(`Já existe "${dados.nome}" em ${dados.cidade}/${dados.uf}. Edite o cadastro existente.`);
    }
    // Só ao criar ou ao trocar nome, cidade ou UF: o cadastro antigo que coincide com um local do IAM Control continua
    // editável até a sincronização ligá-lo.
    const mudouDeLugar = !antes || chaveDoLocal(antes) !== chaveDoLocal(dados);
    const doIamControl = mudouDeLugar && dados.tipo !== "APARTAMENTO" ? await repo.localDoIamControlComNome(dados, localId) : null;
    if (doIamControl) {
      throw new RegraDeNegocioError(
        `"${dados.nome}" em ${dados.cidade}/${dados.uf} já veio do IAM Control como ${rotuloDoTipoDeLocal(doIamControl.tipo).toLowerCase()}. Edite esse cadastro em vez de criar outro` +
          (doIamControl.tipo === "EVENTO" && dados.tipo === "HOTEL" ? " (para hospedar o staff nele, mude o tipo para Hotel)." : "."),
      );
    }
    if (antes && antes.tipo !== dados.tipo && antes.uso.hospedagens > 0) throw new RegraDeNegocioError(TIPO_COM_HOSPEDAGEM);
    if (!localId) {
      const criado = await repo.criar(dados, agora);
      await repo.registrar(criado, { acao: "LOCAL_CRIADO", usuarioId: ator.usuarioId, dados: { mudancas: mudancasDoLocal(null, dados) } });
      return criado;
    }
    if (!(await repo.alterar(localId, dados, agora))) throw new RegraDeNegocioError(LOCAL_SUMIU);
    await repo.registrar(localId, { acao: "LOCAL_ALTERADO", usuarioId: ator.usuarioId, dados: { mudancas: mudancasDoLocal(antes, dados) } });
    return localId;
  });
}

/**
 * Local vindo do IAM Control: o time muda só o que é do Eventos (tipo, complemento, capacidade e localização no mapa).
 * Nome e endereço são do IAM Control e a sincronização os mantém.
 */
export async function ajustarLocalDoIamControl({ localId, ...dados }: AjustarLocalDoIamControl, ator: AtorDaEscrita, agora: Date): Promise<void> {
  return transacao(ator, async (tx) => {
    const repo = criarRepositorioLocal(tx);
    const antes = await repo.local(localId);
    if (!antes) throw new RegraDeNegocioError(LOCAL_SUMIU);
    if (antes.origem !== "IAM_CONTROL") throw new RegraDeNegocioError(NAO_VEM_DO_IAM_CONTROL);
    if (antes.tipo !== dados.tipo && antes.uso.hospedagens > 0) throw new RegraDeNegocioError(TIPO_COM_HOSPEDAGEM);
    if (!(await repo.ajustarDoIamControl(localId, dados, agora))) throw new RegraDeNegocioError(LOCAL_SUMIU);
    await repo.registrar(localId, { acao: "LOCAL_ALTERADO", usuarioId: ator.usuarioId, dados: { mudancas: mudancasDoLocal(antes, dados) } });
  });
}

/** Tira o local das listas (deleted_at). Local usado por evento ou hospedagem não sai. */
export async function arquivarLocal(localId: string, ator: AtorDaEscrita, agora: Date): Promise<void> {
  await transacao(ator, async (tx) => {
    const repo = criarRepositorioLocal(tx);
    const uso = await repo.travarUso(localId);
    if (!uso) throw new RegraDeNegocioError(LOCAL_SUMIU);
    const motivo = motivoParaNaoArquivar(uso);
    if (motivo) throw new RegraDeNegocioError(motivo);
    await repo.arquivar(localId, agora);
    await repo.registrar(localId, { acao: "LOCAL_ARQUIVADO", usuarioId: ator.usuarioId, dados: {} });
  });
}
