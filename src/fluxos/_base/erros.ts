import { logger, serializarErro } from "@/core/logging";

export const MENSAGEM_ESCRITA_DESLIGADA = "Escrita desligada neste ambiente. As telas estão em modo somente leitura.";
export const MENSAGEM_CONFLITO = "Os dados mudaram desde que você abriu a tela. Recarregue a página e tente de novo.";
export const MENSAGEM_DADOS_RECUSADOS = "O banco de dados recusou estes dados. Confira os campos e tente de novo.";
export const MENSAGEM_FALHA = "Não foi possível concluir a ação. Tente de novo.";

/** Alguma trava da guarda de escrita está fechada (docs/07 §3.1). */
export class EscritaDesligadaError extends Error {
  constructor(readonly motivo: string) {
    super(`escrita desligada: ${motivo}`);
    this.name = "EscritaDesligadaError";
  }
}

/** Compare-and-set não encontrou o estado esperado (0 linhas): outra pessoa mudou antes. */
export class ConflitoDeVersaoError extends Error {
  constructor(detalhe = "o registro mudou") {
    super(detalhe);
    this.name = "ConflitoDeVersaoError";
  }
}

/** Erro de regra que o fluxo já traduziu para a pessoa: `mensagem` vai direto para a tela. */
export class RegraDeNegocioError extends Error {
  constructor(readonly mensagem: string) {
    super(mensagem);
    this.name = "RegraDeNegocioError";
  }
}

function codigoDoPostgres(erro: unknown): string | null {
  for (let atual: unknown = erro; atual instanceof Error; atual = atual.cause) {
    const codigo = (atual as { code?: unknown }).code;
    if (typeof codigo === "string" && /^[0-9A-Z]{5}$/.test(codigo)) return codigo;
  }
  return null;
}

/**
 * Mensagem em português para a tela. Erro inesperado e violação de CHECK/UNIQUE/FK (classe 23 do Postgres)
 * viram mensagem genérica e vão para o log, sem SQL na tela.
 */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof RegraDeNegocioError) return erro.mensagem;
  if (erro instanceof EscritaDesligadaError) return MENSAGEM_ESCRITA_DESLIGADA;
  if (erro instanceof ConflitoDeVersaoError) return MENSAGEM_CONFLITO;

  const codigo = codigoDoPostgres(erro);
  if (codigo === "40001" || codigo === "40P01") return MENSAGEM_CONFLITO;
  logger.error({ err: serializarErro(erro), codigo }, "falha numa ação do time");
  return codigo?.startsWith("23") ? MENSAGEM_DADOS_RECUSADOS : MENSAGEM_FALHA;
}
