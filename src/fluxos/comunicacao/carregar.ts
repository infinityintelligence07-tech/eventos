import { bancoParaLeitura, situacaoDaEscrita } from "@/fluxos/_base";
import {
  contarSituacoes,
  type ContagemDeSituacoes,
  criarRepositorioComunicacao,
  type EventoDaComunicacao,
  gerarCopysDaEquipe,
  listarEmPortugues,
  modeloEmUso,
  type SituacaoDaCopy,
  type TipoDeModelo,
  TIPOS_DE_MODELO,
} from "@/modules/comunicacao";
import { podeComunicar, type StatusEscala } from "@/modules/escala";

import { type CopyNaTela, copyNaTela, ordenarPorSituacao } from "./copys-na-tela";

const ESCALAS_COMUNICAVEIS: StatusEscala[] = ["APROVADA", "COMUNICADA"];

// status_escala tem CHECK no banco com os valores de StatusEscala.
const escalaComunicavel = (evento: EventoDaComunicacao) => podeComunicar(evento.statusEscala as StatusEscala);

export type ComunicacaoDoEvento = {
  evento: { id: string; codigo: string | null; nome: string; statusEscala: StatusEscala };
  escalaComunicavel: boolean;
  escritaLiberada: boolean;
  tipo: TipoDeModelo;
  /** Nulo = não há modelo ativo deste tipo. */
  modelo: { id: string; nome: string } | null;
  /** Tipos com modelo ativo, para o seletor da tela. */
  tiposDisponiveis: TipoDeModelo[];
  /** Ordenadas pelo que pede ação primeiro. */
  pessoas: CopyNaTela[];
  contagem: ContagemDeSituacoes;
};

/** Copys de um evento para a tela de Comunicação do evento. Nulo = evento não encontrado. */
export async function carregarComunicacaoDoEvento(eventoId: string, tipo: TipoDeModelo, agora: Date): Promise<ComunicacaoDoEvento | null> {
  const repo = criarRepositorioComunicacao(await bancoParaLeitura());
  const [evento] = await repo.eventos({ eventoId });
  if (!evento) return null;

  const modelos = await repo.modelos();
  const modelo = modeloEmUso(modelos, tipo);
  const comunicavel = escalaComunicavel(evento);
  const pessoas =
    comunicavel && modelo
      ? ordenarPorSituacao((await gerarCopysDaEquipe(repo, { eventos: [evento], modelo, instante: agora })).map(copyNaTela))
      : [];

  return {
    evento: { id: evento.id, codigo: evento.codigo, nome: evento.nome, statusEscala: evento.statusEscala as StatusEscala },
    escalaComunicavel: comunicavel,
    escritaLiberada: (await situacaoDaEscrita()).liberada,
    tipo,
    modelo: modelo && { id: modelo.id, nome: modelo.nome },
    tiposDisponiveis: TIPOS_DE_MODELO.filter((outro) => modeloEmUso(modelos, outro) !== null),
    pessoas,
    contagem: contarSituacoes(pessoas.map((pessoa) => pessoa.situacao)),
  };
}

export type EventoNaComunicacao = {
  id: string;
  codigo: string | null;
  nome: string;
  tipoSigla: string | null;
  tipoNome: string | null;
  edicao: string | null;
  dataInicio: string;
  dataFim: string;
  statusEscala: StatusEscala;
  contagem: ContagemDeSituacoes;
  total: number;
};

export type ListaDaComunicacao = {
  eventos: EventoNaComunicacao[];
  /** Soma de todos os eventos (sem o filtro). */
  totais: ContagemDeSituacoes;
  /** Não há modelo de escalação ativo: nenhuma copy é gerada. */
  semModelo: boolean;
};

type CopysPorEvento = { eventos: EventoDaComunicacao[]; copys: CopyNaTela[]; semModelo: boolean };

/** Copys de escalação dos eventos com escala aprovada ou comunicada que ainda não terminaram. */
async function copysDeEscalacao(agora: Date): Promise<CopysPorEvento> {
  const repo = criarRepositorioComunicacao(await bancoParaLeitura());
  const eventos = await repo.eventos({ statusEscala: ESCALAS_COMUNICAVEIS, fimDesde: agora });
  const modelo = modeloEmUso(await repo.modelos(), "ESCALACAO");
  if (!modelo) return { eventos, copys: [], semModelo: true };
  const copys = (await gerarCopysDaEquipe(repo, { eventos, modelo, instante: agora })).map(copyNaTela);
  return { eventos, copys, semModelo: false };
}

/** Lista entre eventos. `situacao` mostra só os eventos com pelo menos uma copy nessa situação. */
export async function listarComunicacao(filtros: { situacao?: SituacaoDaCopy }, agora: Date): Promise<ListaDaComunicacao> {
  const { eventos, copys, semModelo } = await copysDeEscalacao(agora);
  const linhas = eventos.map((evento) => {
    const doEvento = copys.filter((copy) => copy.eventoId === evento.id);
    return {
      id: evento.id,
      codigo: evento.codigo,
      nome: evento.nome,
      tipoSigla: evento.tipoSigla,
      tipoNome: evento.tipoNome,
      edicao: evento.edicao,
      dataInicio: evento.dataInicio,
      dataFim: evento.dataFim,
      statusEscala: evento.statusEscala as StatusEscala,
      contagem: contarSituacoes(doEvento.map((copy) => copy.situacao)),
      total: doEvento.length,
    };
  });
  return {
    eventos: filtros.situacao ? linhas.filter((linha) => linha.contagem[filtros.situacao!] > 0) : linhas,
    totais: contarSituacoes(copys.map((copy) => copy.situacao)),
    semModelo,
  };
}

/** Mesmo formato em todos os fluxos (docs/07 §7.3). */
export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

const LIMITE_DE_EXEMPLOS = 6;

/** Copys de escalação com falta de dado e desatualizadas, para o Início. */
export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const { eventos, copys } = await copysDeEscalacao(agora);
  const codigo = new Map(eventos.map((evento) => [evento.id, evento.codigo ?? evento.nome]));

  const item = (chave: string, titulo: string, situacao: SituacaoDaCopy, filtro: string, detalhe: (copy: CopyNaTela) => string): ItemDoInicio => {
    const nessaSituacao = copys.filter((copy) => copy.situacao === situacao);
    return {
      chave,
      titulo,
      quantidade: nessaSituacao.length,
      href: `/comunicacao?situacao=${filtro}`,
      exemplos: nessaSituacao.slice(0, LIMITE_DE_EXEMPLOS).map((copy) => ({
        rotulo: `${copy.nome} · ${codigo.get(copy.eventoId)}`,
        detalhe: detalhe(copy),
        href: `/eventos/${copy.eventoId}/comunicacao?pessoa=${copy.convocacaoId}`,
      })),
    };
  };

  return [
    item("comunicacao-falta-dado", "Copys com falta de dado", "FALTA_DADO", "falta-dado", (copy) =>
      `falta ${listarEmPortugues(copy.faltando.map((falta) => falta.rotulo))}`,
    ),
    item("comunicacao-desatualizadas", "Copys desatualizadas", "DESATUALIZADA", "desatualizada", () => "dados mudaram depois do envio"),
  ];
}
