// Quem precisa de hotel num evento (docs/07 §4.6). O hotel é pedido à SDC junto com o voo, até 3 meses antes, quando
// a escala ainda não existe; por isso a necessidade não depende da escala. São três origens, e a lista do evento é a
// união delas (a pessoa aparece uma vez só, com as origens que tem):
//   ESCALA — a caixa "Hotel" na linha da pessoa na escala (convocação principal ativa);
//   VOO    — "Também precisa de hotel" num pedido de voo não cancelado da pessoa para o evento;
//   AVULSA — acrescentada direto na tela de Hospedagem.

export const ORIGENS_DO_HOTEL = ["ESCALA", "VOO", "AVULSA"] as const;
export type OrigemDoHotel = (typeof ORIGENS_DO_HOTEL)[number];

export function rotuloDaOrigemDoHotel(origem: OrigemDoHotel): string {
  switch (origem) {
    case "ESCALA":
      return "da escala";
    case "VOO":
      return "do pedido de voo";
    case "AVULSA":
      return "acrescentada aqui";
    default: {
      const desconhecida: never = origem;
      throw new Error(`origem do hotel desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Na ordem fixa (escala, voo, acrescentada), sem repetir. */
export function ordenarOrigens(origens: readonly OrigemDoHotel[]): OrigemDoHotel[] {
  return ORIGENS_DO_HOTEL.filter((origem) => origens.includes(origem));
}

export type SituacaoDoHospede = { origens: readonly OrigemDoHotel[]; noQuarto: boolean };

/**
 * Tirar uma origem À MÃO (desmarcar "Hotel" na escala, desmarcar "Também precisa de hotel" no voo, tirar da lista na
 * Hospedagem). Com outra origem, a pessoa continua na lista e no quarto. Se for a única origem e a pessoa está num
 * quarto, é recusado: primeiro tira-se do quarto ("ninguém some de um quarto sem alguém tirar").
 */
export function podeTirarOrigem({ origens, noQuarto }: SituacaoDoHospede, tirar: OrigemDoHotel): { ok: true } | { ok: false; motivo: "NAO_TEM" | "NO_QUARTO" } {
  if (!origens.includes(tirar)) return { ok: false, motivo: "NAO_TEM" };
  if (noQuarto && origens.every((origem) => origem === tirar)) return { ok: false, motivo: "NO_QUARTO" };
  return { ok: true };
}

/**
 * Uma origem some por CONSEQUÊNCIA de outra ação (a pessoa saiu da escala, o pedido de voo foi cancelado). Ninguém é
 * arrancado do quarto por isso: se ela está num quarto e ficou sem nenhuma origem, passa a constar como acrescentada
 * na Hospedagem, e o time decide lá se tira. Fora de quarto, só sai da lista.
 */
export function precisaManterComoAvulsa({ origens, noQuarto }: SituacaoDoHospede): boolean {
  return noQuarto && origens.length === 0;
}
