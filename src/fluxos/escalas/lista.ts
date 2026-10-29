import { bancoParaLeitura } from "@/fluxos/_base";
import { criarConsultaDaEscala, type EventoDaLista, pontosDeAtencao, type PontoDeAtencao, type StatusEscala } from "@/modules/escala";
import { dataEmSaoPaulo, type SituacaoNoCalendario, situacaoNoCalendario, somarDias, type StatusEvento } from "@/modules/eventos";

// Escalas (lista entre eventos) e a fila de aprovação da líder (docs/08 §6.1 e §6.3).

export const SITUACOES_DA_LISTA = ["a-montar", "aguardando", "devolvidas", "aprovadas", "comunicadas"] as const;
export type SituacaoDaLista = (typeof SITUACOES_DA_LISTA)[number];
export const PERIODOS_DA_LISTA = [30, 60, 90] as const;

export type FiltrosDaLista = { situacao?: string; polo?: string; tipo?: string; periodo?: string; busca?: string; masterclass?: string };

export type EventoNaLista = EventoDaLista & { situacao: SituacaoNoCalendario };

export type ListaDeEscalas = {
  eventos: EventoNaLista[];
  contagem: Record<SituacaoDaLista, number> & { todas: number };
  filtros: {
    situacao: SituacaoDaLista | null;
    polo: string | null;
    tipo: string | null;
    periodo: (typeof PERIODOS_DA_LISTA)[number];
    busca: string;
    esconderMasterclasses: boolean;
  };
  opcoes: { polos: { codigo: string; nome: string }[]; tipos: { sigla: string; nome: string }[] };
  aguardandoAprovacao: number;
};

function situacaoDaLista(status: StatusEscala): SituacaoDaLista {
  switch (status) {
    case "SEM_ESCALA":
    case "RASCUNHO":
      return "a-montar";
    case "AGUARDANDO_APROVACAO":
      return "aguardando";
    case "DEVOLVIDA":
      return "devolvidas";
    case "APROVADA":
      return "aprovadas";
    case "COMUNICADA":
      return "comunicadas";
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export async function listarEscalas(pedido: FiltrosDaLista, agora: Date): Promise<ListaDeEscalas> {
  const consulta = criarConsultaDaEscala(await bancoParaLeitura());
  const hoje = dataEmSaoPaulo(agora);
  const periodo = PERIODOS_DA_LISTA.find((dias) => String(dias) === pedido.periodo) ?? 30;
  const [linhas, opcoes] = await Promise.all([consulta.eventosDaLista({ de: hoje, ate: somarDias(hoje, periodo) }), consulta.opcoesDeFiltro()]);

  const polo = opcoes.polos.some((opcao) => opcao.codigo === pedido.polo) ? pedido.polo! : null;
  const tipo = opcoes.tipos.some((opcao) => opcao.sigla === pedido.tipo) ? pedido.tipo! : null;
  const situacao = SITUACOES_DA_LISTA.find((valor) => valor === pedido.situacao) ?? null;
  const busca = (pedido.busca ?? "").trim().slice(0, 80);
  // Masterclasses ficam escondidas por padrão: são muitas e cada uma tem equipe pequena.
  const esconderMasterclasses = pedido.masterclass !== "mostrar";

  const filtrados = linhas
    .map((linha): EventoNaLista => ({ ...linha, situacao: situacaoNoCalendario({ status: linha.status as StatusEvento, statusEscala: linha.statusEscala }) }))
    .filter(
      (linha) =>
        (!polo || linha.poloCodigo === polo) &&
        (!tipo || linha.tipoSigla === tipo) &&
        (!esconderMasterclasses || linha.tipoSigla !== "MC") &&
        (!busca || normalizar(`${linha.codigo ?? ""} ${linha.nome}`).includes(normalizar(busca))),
    );
  // Cancelados só aparecem em "Todas"; não contam como escala a montar.
  const ativos = filtrados.filter((linha) => linha.status !== "CANCELADO");
  const contagem = { "a-montar": 0, aguardando: 0, devolvidas: 0, aprovadas: 0, comunicadas: 0, todas: filtrados.length };
  for (const linha of ativos) contagem[situacaoDaLista(linha.statusEscala)] += 1;

  return {
    eventos: situacao ? ativos.filter((linha) => situacaoDaLista(linha.statusEscala) === situacao) : filtrados,
    contagem,
    filtros: { situacao, polo, tipo, periodo, busca, esconderMasterclasses },
    opcoes,
    aguardandoAprovacao: (await consulta.eventosDaLista({ statusEscala: ["AGUARDANDO_APROVACAO"] })).filter((linha) => linha.status !== "CANCELADO").length,
  };
}

export type EscalaNaFila = EventoDaLista & { pontosDeAtencao: PontoDeAtencao[] };

/** Escalas aguardando aprovação, o evento mais próximo primeiro. */
export async function carregarFilaDeAprovacao(): Promise<EscalaNaFila[]> {
  const consulta = criarConsultaDaEscala(await bancoParaLeitura());
  const fila = (await consulta.eventosDaLista({ statusEscala: ["AGUARDANDO_APROVACAO"] })).filter((linha) => linha.status !== "CANCELADO");
  const ids = fila.map((linha) => linha.id);
  const [linhas, situacoes] = await Promise.all([consulta.linhasDosEventos(ids), consulta.situacaoParaAtencao(ids)]);

  return fila.map((evento) => {
    const doEvento = linhas.filter((linha) => linha.eventoId === evento.id);
    const situacao = situacoes.find((item) => item.eventoId === evento.id);
    return {
      ...evento,
      pontosDeAtencao: pontosDeAtencao({
        vagasAbertas: doEvento.map((linha) => ({ funcao: linha.nomeDaFuncao, abertas: Math.max(0, linha.quantidade - linha.ativas) })),
        funcoesSemConfirmacao: doEvento.filter((linha) => !linha.confirmada).map((linha) => linha.nomeDaFuncao),
        disseramQueNaoPodem: situacao?.disseramQueNaoPodem ?? 0,
        semRespostaNaEnquete: situacao?.semRespostaNaEnquete ?? 0,
        vooSemPedido: situacao?.vooSemPedido ?? 0,
        trainees: situacao?.trainees ?? [],
      }),
    };
  });
}
