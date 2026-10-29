import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { ErroDaLogistica, LogisticaMudouError } from "@/modules/logistica";

/** Item do Início (docs/07 §7.3). */
export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

export const LIMITE_DE_EXEMPLOS = 6;

/** Erros do módulo viram mensagem da tela (RegraDeNegocioError) ou "recarregue" (ConflitoDeVersaoError). */
export async function traduzirErros<T>(trabalho: () => Promise<T>): Promise<T> {
  try {
    return await trabalho();
  } catch (erro: unknown) {
    if (erro instanceof ErroDaLogistica) throw new RegraDeNegocioError(erro.mensagem);
    if (erro instanceof LogisticaMudouError) throw new ConflitoDeVersaoError(erro.message);
    throw erro;
  }
}
