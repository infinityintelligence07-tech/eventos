import {
  dataEmSaoPaulo,
  deslocarMes,
  ehMasterclass,
  type EventoNoCalendario,
  type FaixaDaSemana,
  faixasDaSemana,
  type Mes,
  mesDoTexto,
  nomeDoMes,
  noRecorte,
  ocorreNoDia,
  primeiroDia,
  type RecorteDoCalendario,
  recorteDoTexto,
  semanasDoMes,
  textoDoMes,
  ultimoDia,
} from "../domain/calendario";
import type { OpcoesDeFiltro, RepositorioCalendario } from "../repository/calendario-repository";

export type DiaDoCalendario = {
  data: string;
  doMes: boolean;
  hoje: boolean;
  /** Masterclasses do dia, recolhidas num resumo; só no recorte "todos" (em "palestras" elas são as faixas). */
  masterclasses: EventoNoCalendario[];
};

export type SemanaDoCalendario = {
  /** Segunda a domingo. */
  dias: DiaDoCalendario[];
  /** Uma faixa contínua por evento, do primeiro ao último dia dele na semana. */
  faixas: FaixaDaSemana<EventoNoCalendario>[];
};

export type Calendario = {
  mes: string;
  nomeDoMes: string;
  mesAnterior: string;
  proximoMes: string;
  mesDeHoje: string;
  semanas: SemanaDoCalendario[];
  resumo: { eventos: number; masterclasses: number; vagas: number };
  /** `tipos` já vem só com os tipos que existem no recorte. */
  filtros: OpcoesDeFiltro & { polo: string | null; tipo: string | null; recorte: RecorteDoCalendario };
  ultimaSincronizacao: Date | null;
};

export type PedidoDoCalendario = {
  mes?: string;
  polo?: string;
  tipo?: string;
  /** "eventos" | "palestras" | "todos"; vazio ou desconhecido cai no padrão. */
  mostrar?: string;
  agora: Date;
};

export async function carregarCalendario(repositorio: RepositorioCalendario, pedido: PedidoDoCalendario): Promise<Calendario> {
  const hoje = dataEmSaoPaulo(pedido.agora);
  const mes: Mes = mesDoTexto(pedido.mes, hoje);
  const semanas = semanasDoMes(mes);
  const recorte = recorteDoTexto(pedido.mostrar);
  const opcoes = await repositorio.opcoesDeFiltro();
  // Um tipo de fora do recorte (ex.: Confronto em "palestras") não filtra: a tela ficaria vazia sem explicar por quê.
  const tipos = opcoes.tipos.filter((opcao) => noRecorte({ tipoSigla: opcao.sigla }, recorte));
  const polo = opcoes.polos.some((opcao) => opcao.codigo === pedido.polo) ? pedido.polo! : null;
  const tipo = tipos.some((opcao) => opcao.sigla === pedido.tipo) ? pedido.tipo! : null;

  const [todosDoPeriodo, ultimaSincronizacao] = await Promise.all([
    repositorio.eventosDoPeriodo({
      de: semanas[0]![0]!,
      ate: semanas.at(-1)!.at(-1)!,
      poloCodigo: polo ?? undefined,
      tipoSigla: tipo ?? undefined,
    }),
    repositorio.ultimaSincronizacao(),
  ]);
  const doPeriodo = todosDoPeriodo.filter((evento) => noRecorte(evento, recorte));

  const inicioDoMes = primeiroDia(mes);
  const fimDoMes = ultimoDia(mes);
  const comecamNoMes = doPeriodo.filter(
    (evento) => evento.status !== "CANCELADO" && evento.dataInicio >= inicioDoMes && evento.dataInicio <= fimDoMes,
  );
  const eventosDoMes = comecamNoMes.filter((evento) => !ehMasterclass(evento));

  // Masterclass é muita por dia: junto com os eventos fica recolhida no dia; sozinha ("palestras") vira faixa.
  const masterclasses = doPeriodo.filter(ehMasterclass);
  const emFaixas = recorte === "palestras" ? masterclasses : doPeriodo.filter((evento) => !ehMasterclass(evento));
  const recolhidas = recorte === "palestras" ? [] : masterclasses;

  return {
    mes: textoDoMes(mes),
    nomeDoMes: nomeDoMes(mes),
    mesAnterior: textoDoMes(deslocarMes(mes, -1)),
    proximoMes: textoDoMes(deslocarMes(mes, 1)),
    mesDeHoje: hoje.slice(0, 7),
    semanas: semanas.map((semana) => ({
      dias: semana.map((data) => ({
        data,
        doMes: data >= inicioDoMes && data <= fimDoMes,
        hoje: data === hoje,
        masterclasses: recolhidas.filter((evento) => ocorreNoDia(evento, data)),
      })),
      faixas: faixasDaSemana(semana, emFaixas),
    })),
    resumo: {
      eventos: eventosDoMes.length,
      masterclasses: comecamNoMes.length - eventosDoMes.length,
      vagas: comecamNoMes.reduce((total, evento) => total + evento.vagas, 0),
    },
    filtros: { polos: opcoes.polos, tipos, polo, tipo, recorte },
    ultimaSincronizacao,
  };
}
