import type { Sentido } from "./pedido";

// A tela de Voos lê como a planilha do time: pedidos agrupados por mês e por evento, uma linha por compra, com o
// trajeto (ida e volta / ida / volta) numa coluna e a ida e a volta lado a lado.

export type Trajeto = "IDA_E_VOLTA" | "IDA" | "VOLTA";

/** Nulo = pedido sem trecho (não acontece em pedido gravado; a linha "A pedir" não tem trechos). */
export function trajetoDosTrechos(sentidos: readonly Sentido[]): Trajeto | null {
  const ida = sentidos.includes("IDA");
  const volta = sentidos.includes("VOLTA");
  if (ida && volta) return "IDA_E_VOLTA";
  if (ida) return "IDA";
  return volta ? "VOLTA" : null;
}

export function rotuloDoTrajeto(trajeto: Trajeto): string {
  switch (trajeto) {
    case "IDA_E_VOLTA":
      return "Ida e volta";
    case "IDA":
      return "Ida";
    case "VOLTA":
      return "Volta";
    default: {
      const desconhecido: never = trajeto;
      throw new Error(`trajeto desconhecido: ${String(desconhecido)}`);
    }
  }
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "2026-12" → "Dezembro de 2026". */
export function rotuloDoMes(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes} de ${mes.slice(0, 4)}`;
}

export type GrupoDoMes<E, L> = { mes: string; eventos: { evento: E; linhas: L[] }[] };

/**
 * Mês → evento → linhas, na ordem da planilha: meses e eventos pela data de início (empate pelo id, para o mesmo
 * evento não se dividir); dentro do evento vale a ordem em que as linhas chegaram.
 */
export function agruparPorMesEEvento<E extends { id: string; dataInicio: string }, L extends { evento: E }>(linhas: L[]): GrupoDoMes<E, L>[] {
  const porEvento = new Map<string, { evento: E; linhas: L[] }>();
  for (const linha of linhas) {
    const grupo = porEvento.get(linha.evento.id) ?? { evento: linha.evento, linhas: [] };
    grupo.linhas.push(linha);
    porEvento.set(linha.evento.id, grupo);
  }
  const eventos = [...porEvento.values()].sort((a, b) => a.evento.dataInicio.localeCompare(b.evento.dataInicio) || a.evento.id.localeCompare(b.evento.id));
  const meses: GrupoDoMes<E, L>[] = [];
  for (const grupo of eventos) {
    const mes = grupo.evento.dataInicio.slice(0, 7);
    const ultimo = meses.at(-1);
    if (ultimo?.mes === mes) ultimo.eventos.push(grupo);
    else meses.push({ mes, eventos: [grupo] });
  }
  return meses;
}
