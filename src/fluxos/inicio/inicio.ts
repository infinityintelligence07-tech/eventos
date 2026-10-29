import { bancoParaLeitura } from "@/fluxos/_base";
import { resumoParaInicio as daComunicacao } from "@/fluxos/comunicacao";
import { resumoParaInicio as dosCustos } from "@/fluxos/custos";
import { resumoParaInicio as daDisponibilidade } from "@/fluxos/disponibilidade";
import { resumoParaInicio as dasEscalas } from "@/fluxos/escalas";
import { resumoParaInicio as dosEventos } from "@/fluxos/eventos";
import { resumoParaInicio as daLogistica } from "@/fluxos/logistica";
import { logger } from "@/core/logging";
import { criarConsultaDaEscala, type EventoDaLista } from "@/modules/escala";
import {
  criarRepositorioCalendario,
  dataEmSaoPaulo,
  ehMasterclass,
  type SituacaoNoCalendario,
  situacaoNoCalendario,
  somarDias,
  type StatusEvento,
} from "@/modules/eventos";

// Início (docs/07 §6.9 e §7.3): junta os resumoParaInicio(agora) de cada aba. Cada fluxo declara o próprio
// ItemDoInicio; aqui vale a compatibilidade estrutural com o tipo central abaixo.

export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

export type OrigemDoInicio = "escalas" | "eventos" | "comunicacao" | "logistica" | "custos" | "disponibilidade";

export type ResumoDaOrigem = { origem: OrigemDoInicio; nome: string } & ({ ok: true; itens: ItemDoInicio[] } | { ok: false });

export type NumeroDoInicio = { rotulo: string; href: string; valor: number | null };

export type EventoDaSemana = EventoDaLista & { situacao: SituacaoNoCalendario };

export type Inicio = {
  numeros: NumeroDoInicio[];
  /** Na ordem da doc 08 §4; a origem que falhou aparece como cartão de erro, sem derrubar o resto. */
  cartoes: ({ tipo: "item"; item: ItemDoInicio } | { tipo: "erro"; origem: OrigemDoInicio; nome: string })[];
  tudoEmDia: boolean;
  /** Masterclasses à parte: muitas no mesmo dia, a tabela mostra só "+N Masterclasses". */
  proximos7Dias: { eventos: EventoDaSemana[]; masterclasses: EventoDaSemana[] } | null;
  ultimaSincronizacao: Date | null;
  sincronizacaoAtrasada: boolean;
};

const FONTES: { origem: OrigemDoInicio; nome: string; carregar: (agora: Date) => Promise<ItemDoInicio[]> }[] = [
  { origem: "escalas", nome: "Escalas", carregar: dasEscalas },
  { origem: "eventos", nome: "Eventos", carregar: dosEventos },
  { origem: "comunicacao", nome: "Comunicação", carregar: daComunicacao },
  { origem: "logistica", nome: "Logística e SDC", carregar: daLogistica },
  { origem: "custos", nome: "Custos", carregar: dosCustos },
  { origem: "disponibilidade", nome: "Disponibilidade", carregar: daDisponibilidade },
];

/** Ordem dos cartões "Precisa de ação" (doc 08 §4). Chave nova de outra frente vai para o fim. */
const ORDEM_DOS_CARTOES = [
  "comunicacao-falta-dado",
  "escalas-aguardando-aprovacao",
  "escalas-devolvidas",
  "escalas-a-montar",
  "escalas-sem-resposta",
  "comunicacao-desatualizadas",
  "confronto-sem-fila",
  "eventos-sem-codigo",
  "custos-para-auditar",
  "custos-criticos",
  "voos-a-pedir",
  "pedidos-alterados",
  "disponibilidade.enquetes-fechando",
];

const NUMEROS: { chave: string; rotulo: string; href: string }[] = [
  { chave: "escalas-a-montar", rotulo: "Escalas a montar", href: "/escalas?situacao=a-montar" },
  { chave: "escalas-aguardando-aprovacao", rotulo: "Aguardando aprovação", href: "/escalas/aprovacao" },
  { chave: "comunicacao-falta-dado", rotulo: "Copys bloqueadas", href: "/comunicacao?situacao=falta-dado" },
  { chave: "custos-para-auditar", rotulo: "Custos para auditar", href: "/custos" },
];

const DIAS_DA_SEMANA = 7;
const SINCRONIZACAO_ATRASADA_MS = 2 * 60 * 60 * 1000;

async function seguro<T>(nome: string, trabalho: () => Promise<T>): Promise<T | null> {
  try {
    return await trabalho();
  } catch (erro: unknown) {
    logger.error({ err: erro, origem: nome }, "falha ao carregar parte do Início");
    return null;
  }
}

export async function carregarResumos(agora: Date, fontes = FONTES): Promise<ResumoDaOrigem[]> {
  const resultados = await Promise.allSettled(fontes.map((fonte) => fonte.carregar(agora)));
  return resultados.map((resultado, indice): ResumoDaOrigem => {
    const { origem, nome } = fontes[indice]!;
    if (resultado.status === "fulfilled") return { origem, nome, ok: true, itens: resultado.value };
    logger.error({ err: resultado.reason, origem }, "falha ao carregar resumo do Início");
    return { origem, nome, ok: false };
  });
}

/** Junta os resumos em números e cartões. Pura: separada para testar a ordem e o tratamento de falha. */
export function montarInicio(resumos: ResumoDaOrigem[]): Pick<Inicio, "numeros" | "cartoes" | "tudoEmDia"> {
  const itens = resumos.flatMap((resumo) => (resumo.ok ? resumo.itens : []));
  const porChave = new Map(itens.map((item) => [item.chave, item]));
  const posicao = (chave: string) => {
    const indice = ORDEM_DOS_CARTOES.indexOf(chave);
    return indice === -1 ? ORDEM_DOS_CARTOES.length : indice;
  };
  const falhas = resumos.filter((resumo) => !resumo.ok);

  return {
    numeros: NUMEROS.map(({ chave, rotulo, href }) => ({ rotulo, href, valor: porChave.get(chave)?.quantidade ?? null })),
    cartoes: [
      ...falhas.map((resumo) => ({ tipo: "erro" as const, origem: resumo.origem, nome: resumo.nome })),
      ...[...itens].sort((a, b) => posicao(a.chave) - posicao(b.chave)).map((item) => ({ tipo: "item" as const, item })),
    ],
    tudoEmDia: falhas.length === 0 && itens.every((item) => item.quantidade === 0),
  };
}

export async function carregarInicio(agora: Date): Promise<Inicio> {
  const hoje = dataEmSaoPaulo(agora);
  const [resumos, semana, ultimaSincronizacao] = await Promise.all([
    carregarResumos(agora),
    seguro("proximos-7-dias", async () =>
      (await criarConsultaDaEscala(await bancoParaLeitura()).eventosDaLista({ de: hoje, ate: somarDias(hoje, DIAS_DA_SEMANA) }))
        .filter((evento) => evento.status !== "CANCELADO")
        .map((evento) => ({ ...evento, situacao: situacaoNoCalendario({ status: evento.status as StatusEvento, statusEscala: evento.statusEscala }) })),
    ),
    seguro("ultima-sincronizacao", async () => criarRepositorioCalendario(await bancoParaLeitura()).ultimaSincronizacao()),
  ]);
  return {
    ...montarInicio(resumos),
    proximos7Dias: semana && {
      eventos: semana.filter((evento) => !ehMasterclass(evento)),
      masterclasses: semana.filter((evento) => ehMasterclass(evento)),
    },
    ultimaSincronizacao: ultimaSincronizacao ?? null,
    sincronizacaoAtrasada: ultimaSincronizacao !== null && ultimaSincronizacao !== undefined && agora.getTime() - ultimaSincronizacao.getTime() > SINCRONIZACAO_ATRASADA_MS,
  };
}
