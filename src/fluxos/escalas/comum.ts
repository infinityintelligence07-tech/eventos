import { type AtorDaEscrita, ConflitoDeVersaoError, type Executor, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import { ErroDaEscala, EscalaMudouError, RegraVagasInvalidaError } from "@/modules/escala";

/** Mesmo formato em todos os fluxos (docs/07 §7.3). */
export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

export const EXEMPLOS_NO_INICIO = 6;

/** Erro de regra vira mensagem da tela; compare-and-set perdido vira "recarregue". */
export function traduzirErro(erro: unknown): never {
  if (erro instanceof ErroDaEscala) throw new RegraDeNegocioError(erro.mensagem);
  if (erro instanceof EscalaMudouError) throw new ConflitoDeVersaoError(erro.message);
  if (erro instanceof RegraVagasInvalidaError) throw new RegraDeNegocioError(`A regra de vagas não é válida: ${erro.erros.join("; ")}.`);
  throw erro;
}

export async function escrever<T>(ator: AtorDaEscrita, trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  try {
    return await transacao(ator, trabalho);
  } catch (erro: unknown) {
    traduzirErro(erro);
  }
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(texto: string | undefined | null): texto is string {
  return typeof texto === "string" && FORMATO_UUID.test(texto);
}
