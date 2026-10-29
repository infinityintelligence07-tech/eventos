import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { CustosMudouError, ErroDosCustos } from "@/modules/custos";

/** Item do Início (docs/07 §7.3). */
export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

export const LIMITE_DE_EXEMPLOS = 6;

const FUSO = "America/Sao_Paulo";

/** AAAA-MM-DD do instante em São Paulo. */
export function diaEmSaoPaulo(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

export function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Erros do módulo viram mensagem da tela (RegraDeNegocioError) ou "recarregue" (ConflitoDeVersaoError). */
export async function traduzirErros<T>(trabalho: () => Promise<T>): Promise<T> {
  try {
    return await trabalho();
  } catch (erro: unknown) {
    if (erro instanceof ErroDosCustos) throw new RegraDeNegocioError(erro.mensagem);
    if (erro instanceof CustosMudouError) throw new ConflitoDeVersaoError(erro.message);
    throw erro;
  }
}
