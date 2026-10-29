import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioCalendario, type EventoDoCabecalho, type SituacaoNoCalendario, situacaoNoCalendario } from "@/modules/eventos";

export type CabecalhoDoEvento = EventoDoCabecalho & { situacao: SituacaoNoCalendario };

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cabeçalho comum às abas do evento (layout de /eventos/[eventoId]). Nulo = evento não encontrado. */
export async function carregarCabecalhoDoEvento(eventoId: string): Promise<CabecalhoDoEvento | null> {
  if (!FORMATO_UUID.test(eventoId)) return null;
  const evento = await criarRepositorioCalendario(await bancoParaLeitura()).eventoDoCabecalho(eventoId);
  return evento && { ...evento, situacao: situacaoNoCalendario(evento) };
}
