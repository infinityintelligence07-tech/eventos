import { bancoParaLeitura, RegraDeNegocioError, situacaoDaEscrita, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import {
  CHAVE_LINK_CUSTOS,
  criarRepositorioComunicacao,
  type ExemploDePrevia,
  gerarCopy,
  gerarCopysDaEquipe,
  modeloEmUso,
  type ParteDaCopy,
  type PreviaDoModelo,
  saudacao,
  type SalvarModelo,
  trocaDeTipoRecusada,
  type TipoDeModelo,
  validarModelo,
  VARIAVEIS_COPY,
  type VariavelDaCopy,
} from "@/modules/comunicacao";

import { type FaltaNaCopy, faltasDaCopy } from "./copys-na-tela";

// Configurações › Modelos de copy (docs/07 §6.8) e o link do formulário de custos (§11.1).

export type ModeloNaLista = { id: string; tipo: TipoDeModelo; nome: string; ativo: boolean; emUso: boolean; atualizadoEm: string };

export type ModelosDeCopy = { modelos: ModeloNaLista[]; linkCustos: string | null; escritaLiberada: boolean };

export async function listarModelos(): Promise<ModelosDeCopy> {
  const repo = criarRepositorioComunicacao(await bancoParaLeitura());
  const modelos = await repo.modelos();
  return {
    modelos: modelos.map((modelo) => ({
      id: modelo.id,
      tipo: modelo.tipo,
      nome: modelo.nome,
      ativo: modelo.ativo,
      emUso: modeloEmUso(modelos, modelo.tipo)?.id === modelo.id,
      atualizadoEm: modelo.atualizadoEm.toISOString(),
    })),
    linkCustos: await repo.configuracao(CHAVE_LINK_CUSTOS),
    escritaLiberada: (await situacaoDaEscrita()).liberada,
  };
}

export type CampoDoModelo = { variavel: VariavelDaCopy; rotulo: string; descricao: string };

export type EditorDeModelo = {
  /** Nulo = modelo novo. */
  modelo: { id: string; tipo: TipoDeModelo; nome: string; corpo: string; ativo: boolean } | null;
  exemplos: ExemploDePrevia[];
  campos: CampoDoModelo[];
  escritaLiberada: boolean;
};

const LIMITE_DE_EXEMPLOS = 40;

/** Nulo = o modelo pedido não existe. */
export async function carregarEditorDeModelo(modeloId: string | null, agora: Date): Promise<EditorDeModelo | null> {
  const repo = criarRepositorioComunicacao(await bancoParaLeitura());
  const modelo = modeloId ? await repo.modelo(modeloId) : null;
  if (modeloId && !modelo) return null;
  return {
    modelo: modelo && { id: modelo.id, tipo: modelo.tipo, nome: modelo.nome, corpo: modelo.corpo, ativo: modelo.ativo },
    exemplos: await repo.exemplosParaPrevia(agora, LIMITE_DE_EXEMPLOS),
    campos: (Object.keys(VARIAVEIS_COPY) as VariavelDaCopy[]).map((variavel) => ({
      variavel,
      rotulo: VARIAVEIS_COPY[variavel].rotulo,
      descricao: VARIAVEIS_COPY[variavel].descricao,
    })),
    escritaLiberada: (await situacaoDaEscrita()).liberada,
  };
}

export type PreviaNaTela = { partes: ParteDaCopy[]; faltando: FaltaNaCopy[]; erros: string[] };

/** Prévia do texto em edição com uma pessoa de exemplo (sem pessoa: só saudação e link de custos). Não grava nada. */
export async function previaDoModelo({ corpo, convocacaoId, eventoId }: PreviaDoModelo, agora: Date): Promise<PreviaNaTela> {
  const repo = criarRepositorioComunicacao(await bancoParaLeitura());
  const rascunho = { id: "previa", tipo: "ESCALACAO" as const, nome: "Prévia", corpo, ativo: true, atualizadoEm: agora };
  const eventos = convocacaoId && eventoId ? await repo.eventos({ eventoId }) : [];
  const [daPessoa] = eventos.length > 0 ? await gerarCopysDaEquipe(repo, { eventos, modelo: rascunho, instante: agora, convocacaoId }) : [];
  const copy = daPessoa?.copy ?? gerarCopy(corpo, { saudacao: saudacao(agora), link_custos: await repo.configuracao(CHAVE_LINK_CUSTOS) });
  return { partes: copy.partes, faltando: faltasDaCopy(copy.faltando), erros: validarModelo(corpo) };
}

const MODELO_SUMIU = "Este modelo não existe mais. Recarregue a página.";

export type ModeloSalvo = { id: string; ativo: boolean };

/**
 * Cria (inativo) ou altera. Com `ativar`, passa a ser o modelo do tipo na Comunicação e o anterior é desativado,
 * na mesma transação. Copys já enviadas não mudam (o hash é dos dados, não do texto).
 */
export async function salvarModelo({ modeloId, ativar, ...texto }: SalvarModelo, ator: AtorDaEscrita, agora: Date): Promise<ModeloSalvo> {
  const registro = { usuarioId: ator.usuarioId, instante: agora };
  return transacao(ator, async (tx) => {
    const repo = criarRepositorioComunicacao(tx);
    let id: string;
    let ativo = false;
    if (modeloId) {
      const atual = await repo.modelo(modeloId);
      if (!atual) throw new RegraDeNegocioError(MODELO_SUMIU);
      if (trocaDeTipoRecusada(atual, texto.tipo)) {
        throw new RegraDeNegocioError("Este modelo está em uso na Comunicação. Desative-o antes de trocar o tipo.");
      }
      if (!(await repo.alterarModelo(modeloId, texto, registro))) throw new RegraDeNegocioError(MODELO_SUMIU);
      id = modeloId;
      ativo = atual.ativo;
    } else {
      id = await repo.criarModelo(texto, registro);
    }
    if (ativar && !ativo) {
      await repo.ativarModelo(id, registro);
      ativo = true;
    }
    return { id, ativo };
  });
}

/** Ativar desativa o outro ativo do mesmo tipo (um ativo por tipo). */
export async function definirModeloAtivo(modeloId: string, ativo: boolean, ator: AtorDaEscrita, agora: Date): Promise<void> {
  const registro = { usuarioId: ator.usuarioId, instante: agora };
  // Já no estado pedido: não há o que gravar nem registrar (toda transação de escrita precisa de um registro).
  const atual = await criarRepositorioComunicacao(await bancoParaLeitura()).modelo(modeloId);
  if (!atual) throw new RegraDeNegocioError(MODELO_SUMIU);
  if (atual.ativo === ativo) return;
  await transacao(ator, async (tx) => {
    const repo = criarRepositorioComunicacao(tx);
    const existe = ativo ? (await repo.ativarModelo(modeloId, registro)) !== null : await repo.desativarModelo(modeloId, registro);
    if (!existe) throw new RegraDeNegocioError(MODELO_SUMIU);
  });
}

/** Vazio apaga: a copy que usa {{link_custos}} fica bloqueada até alguém preencher (docs/07 §11.1). */
export async function salvarLinkDeCustos(linkCustos: string | null, ator: AtorDaEscrita, agora: Date): Promise<void> {
  await transacao(ator, (tx) => criarRepositorioComunicacao(tx).salvarConfiguracao(CHAVE_LINK_CUSTOS, linkCustos, { usuarioId: ator.usuarioId, instante: agora }));
}
