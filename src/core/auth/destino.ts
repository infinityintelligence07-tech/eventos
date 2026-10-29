// Destino depois do login (`?proximo=`). Só caminho interno: começa com uma barra que não é seguida de outra barra
// nem de contrabarra (o navegador lê `//site` e `/\site` como outro domínio), sem caractere de controle.
// O GH aceita `//site-externo` (startsWith("/")); aqui não (docs/09 §2.2).

export const DESTINO_PADRAO = "/inicio";

/** Motivos aceitos ao encerrar a sessão (/auth/encerrar → POST /auth/sair). Viram ?erro= no login. */
export type MotivoDeSaida = "sem-cadastro";

export function motivoDeSaida(valor: unknown): MotivoDeSaida | null {
  return valor === "sem-cadastro" ? valor : null;
}

const CAMINHO_INTERNO = /^\/(?![/\\])/;
const CARACTERE_DE_CONTROLE = /[\u0000-\u001f\u007f]/;

/**
 * URL absoluta para um redirecionamento. Usa EVENTOS_URL_PUBLICA (obrigatória em produção); a origem da requisição
 * só entra fora de produção, quando a variável não existe. `caminho` precisa já ter passado por destinoSeguro.
 */
export function enderecoAbsoluto(caminho: string, urlPublica: string | null, origemDaRequisicao: string): URL {
  const base = new URL(urlPublica ?? origemDaRequisicao);
  const endereco = new URL(destinoSeguro(caminho), base.origin);
  return endereco;
}

export function destinoSeguro(proximo: string | null | undefined, padrao = DESTINO_PADRAO): string {
  if (!proximo || proximo.length > 2048) return padrao;
  if (!CAMINHO_INTERNO.test(proximo) || CARACTERE_DE_CONTROLE.test(proximo) || proximo.includes("\\")) return padrao;
  // Confere que, resolvido contra uma origem qualquer, o destino continua nela.
  const base = "https://eventos.invalido";
  try {
    const resolvido = new URL(proximo, base);
    if (resolvido.origin !== base) return padrao;
    return `${resolvido.pathname}${resolvido.search}${resolvido.hash}`;
  } catch {
    return padrao;
  }
}
