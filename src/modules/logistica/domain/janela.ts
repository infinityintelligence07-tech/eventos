import { diasEntre } from "./datas";

// Janela de compra de passagem (docs/07 §4.5 e §11.1): abre em D-90; a partir de D-60 o pedido conta como atrasado.

export const DIAS_ABRE_A_JANELA = 90;
export const DIAS_ATRASADO = 60;

export type JanelaDeCompra = "FORA_DA_JANELA" | "NA_JANELA" | "ATRASADO";

export function janelaDeCompra(dataDoEvento: string, hoje: string): { janela: JanelaDeCompra; dias: number } {
  const dias = diasEntre(hoje, dataDoEvento);
  if (dias > DIAS_ABRE_A_JANELA) return { janela: "FORA_DA_JANELA", dias };
  if (dias > DIAS_ATRASADO) return { janela: "NA_JANELA", dias };
  return { janela: "ATRASADO", dias };
}

/** Na janela ou atrasado: já devia ter pedido. */
export function precisaPedir(janela: JanelaDeCompra): boolean {
  switch (janela) {
    case "NA_JANELA":
    case "ATRASADO":
      return true;
    case "FORA_DA_JANELA":
      return false;
    default: {
      const desconhecida: never = janela;
      throw new Error(`janela desconhecida: ${String(desconhecida)}`);
    }
  }
}
