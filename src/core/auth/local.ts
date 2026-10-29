// Modo local (docs/09 §3.3): "Entrar como" grava só o id do core.usuario neste cookie. O cookie só vale com as três
// travas do banco local abertas; o ator é resolvido no banco local pelas mesmas regras do login real.

export const COOKIE_ATOR_LOCAL = "eventos_ator_local";

/** 12 h, como a sessão sugerida para o login real (docs/09 §13). */
export const DURACAO_DO_COOKIE_LOCAL_EM_SEGUNDOS = 12 * 60 * 60;

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valor do cookie → id do usuário; qualquer outra coisa é ignorada. */
export function usuarioDoCookieLocal(valor: string | null | undefined): string | null {
  return valor && FORMATO_UUID.test(valor) ? valor.toLowerCase() : null;
}
