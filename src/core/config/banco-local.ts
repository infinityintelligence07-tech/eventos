import { parse } from "pg-connection-string";

import { apontaParaLocalhost, HOSTS_LOCAIS, PARAMETROS_QUE_DESVIAM } from "./leitura";

// Fora de index.ts de propósito: o pg-connection-string referencia `fs` e não compila no runtime edge,
// onde o instrumentation.ts importa a configuração.

export type BancoLocal = { host: string; porta: number };

type UrlLida = { host: string; porta: number };

/**
 * A URL como o driver (pg) vai usá-la, pelo mesmo parser do pg (pg-connection-string). Nulo = inválida, com mais de
 * um host ou com host, hostaddr ou options (desviam o servidor ou trocam o papel: `options=-c role=…`).
 */
function lerSemDesvio(url: string): UrlLida | null {
  try {
    if ([...new URL(url).searchParams.keys()].some((nome) => PARAMETROS_QUE_DESVIAM.has(nome.toLowerCase()))) return null;
  } catch {
    return null;
  }

  let lida: ReturnType<typeof parse>;
  try {
    lida = parse(url);
  } catch {
    return null;
  }
  if (lida.options || (lida as { hostaddr?: unknown }).hostaddr) return null;
  if (!lida.host || lida.host.includes(",")) return null;

  const porta = lida.port ? Number(lida.port) : 5432;
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) return null;
  return { host: lida.host, porta };
}

/** O banco que o driver vai usar de fato, se for local. Nulo = remoto, URL inválida ou com host, hostaddr ou options. */
export function bancoLocalDaUrl(url: string): BancoLocal | null {
  if (!apontaParaLocalhost(url)) return null;
  const lida = lerSemDesvio(url);
  if (!lida || !HOSTS_LOCAIS.has(lida.host)) return null;
  return lida;
}

export function bancoLocal(url: string): boolean {
  return bancoLocalDaUrl(url) !== null;
}

/** URL sem desvio (host, hostaddr, options, vários hosts), local ou remota: a de escrita da produção. */
export function urlSemDesvio(url: string): boolean {
  return lerSemDesvio(url) !== null;
}
