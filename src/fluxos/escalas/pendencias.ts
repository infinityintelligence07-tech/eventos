import { bancoParaLeitura } from "@/fluxos/_base";
import { criarConsultaDaEscala, type EventoDaLista } from "@/modules/escala";
import { criarRepositorioCalendario, dataEmSaoPaulo, DIAS_PARA_MONTAR_ESCALA, type EventoNoCalendario, pendenciasDosEventos, somarDias } from "@/modules/eventos";

export type EscalaAMontar = EventoNoCalendario & Pick<EventoDaLista, "preenchidas" | "local">;

/**
 * Cartões "Escalas a montar" da aba Escalas: um para os eventos e outro para as Masterclasses que começam nos próximos
 * dias com a escala ainda não aprovada. A regra é a mesma do Início (`pendenciasDosEventos`); a lista só acrescenta
 * local e vagas preenchidas.
 */
export async function escalasAMontar(agora: Date): Promise<{ eventos: EscalaAMontar[]; masterclasses: EscalaAMontar[] }> {
  const db = await bancoParaLeitura();
  const hoje = dataEmSaoPaulo(agora);
  const periodo = { de: hoje, ate: somarDias(hoje, DIAS_PARA_MONTAR_ESCALA) };
  const [eventos, daLista] = await Promise.all([criarRepositorioCalendario(db).eventosDoPeriodo(periodo), criarConsultaDaEscala(db).eventosDaLista(periodo)]);
  const extras = new Map(daLista.map((evento) => [evento.id, evento]));
  const completar = (evento: EventoNoCalendario): EscalaAMontar => ({
    ...evento,
    preenchidas: extras.get(evento.id)?.preenchidas ?? 0,
    local: extras.get(evento.id)?.local ?? null,
  });
  const pendencias = pendenciasDosEventos(eventos, hoje);
  return { eventos: pendencias.escalasAMontar.map(completar), masterclasses: pendencias.masterclassesAMontar.map(completar) };
}
