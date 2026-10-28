import {
  dataEmSaoPaulo,
  deslocarMes,
  ehMasterclass,
  type EventoNoCalendario,
  type Mes,
  mesDoTexto,
  nomeDoMes,
  ocorreNoDia,
  type Pendencias,
  pendenciasDosEventos,
  primeiroDia,
  semanasDoMes,
  somarDias,
  textoDoMes,
  ultimoDia,
} from "../domain/calendario";
import type { OpcoesDeFiltro, RepositorioCalendario } from "../repository/calendario-repository";

export type DiaDoCalendario = {
  data: string;
  doMes: boolean;
  hoje: boolean;
  eventos: EventoNoCalendario[];
  masterclasses: EventoNoCalendario[];
};

export type Calendario = {
  mes: string;
  nomeDoMes: string;
  mesAnterior: string;
  proximoMes: string;
  mesDeHoje: string;
  semanas: DiaDoCalendario[][];
  resumo: { eventos: number; masterclasses: number; vagas: number; escalasAprovadas: number };
  pendencias: Pendencias;
  filtros: OpcoesDeFiltro & { polo: string | null; tipo: string | null };
  ultimaSincronizacao: Date | null;
};

export type PedidoDoCalendario = {
  mes?: string;
  polo?: string;
  tipo?: string;
  agora: Date;
};

/** Pendências olham este horizonte à frente, independente do mês e dos filtros. */
const DIAS_DE_PENDENCIAS = 90;

export async function carregarCalendario(repositorio: RepositorioCalendario, pedido: PedidoDoCalendario): Promise<Calendario> {
  const hoje = dataEmSaoPaulo(pedido.agora);
  const mes: Mes = mesDoTexto(pedido.mes, hoje);
  const semanas = semanasDoMes(mes);
  const opcoes = await repositorio.opcoesDeFiltro();
  const polo = opcoes.polos.some((opcao) => opcao.codigo === pedido.polo) ? pedido.polo! : null;
  const tipo = opcoes.tipos.some((opcao) => opcao.sigla === pedido.tipo) ? pedido.tipo! : null;

  const [doPeriodo, proximos, ultimaSincronizacao] = await Promise.all([
    repositorio.eventosDoPeriodo({
      de: semanas[0]![0]!,
      ate: semanas.at(-1)!.at(-1)!,
      poloCodigo: polo ?? undefined,
      tipoSigla: tipo ?? undefined,
    }),
    repositorio.eventosDoPeriodo({ de: hoje, ate: somarDias(hoje, DIAS_DE_PENDENCIAS) }),
    repositorio.ultimaSincronizacao(),
  ]);

  const inicioDoMes = primeiroDia(mes);
  const fimDoMes = ultimoDia(mes);
  const comecamNoMes = doPeriodo.filter(
    (evento) => evento.status !== "CANCELADO" && evento.dataInicio >= inicioDoMes && evento.dataInicio <= fimDoMes,
  );
  const eventosDoMes = comecamNoMes.filter((evento) => !ehMasterclass(evento));

  return {
    mes: textoDoMes(mes),
    nomeDoMes: nomeDoMes(mes),
    mesAnterior: textoDoMes(deslocarMes(mes, -1)),
    proximoMes: textoDoMes(deslocarMes(mes, 1)),
    mesDeHoje: hoje.slice(0, 7),
    semanas: semanas.map((semana) =>
      semana.map((data) => {
        const doDia = doPeriodo.filter((evento) => ocorreNoDia(evento, data));
        return {
          data,
          doMes: data >= inicioDoMes && data <= fimDoMes,
          hoje: data === hoje,
          eventos: doDia.filter((evento) => !ehMasterclass(evento)),
          masterclasses: doDia.filter(ehMasterclass),
        };
      }),
    ),
    resumo: {
      eventos: eventosDoMes.length,
      masterclasses: comecamNoMes.length - eventosDoMes.length,
      vagas: comecamNoMes.reduce((total, evento) => total + evento.vagas, 0),
      escalasAprovadas: eventosDoMes.filter(
        (evento) => evento.statusEscala === "APROVADA" || evento.statusEscala === "COMUNICADA",
      ).length,
    },
    pendencias: pendenciasDosEventos(proximos, hoje),
    filtros: { ...opcoes, polo, tipo },
    ultimaSincronizacao,
  };
}
