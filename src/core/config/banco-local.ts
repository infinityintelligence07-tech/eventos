import { parse } from "pg-connection-string";

import { apontaParaLocalhost, HOSTS_LOCAIS } from "./leitura";

// Fora de index.ts de propósito: o pg-connection-string referencia `fs` e não compila no runtime edge,
// onde o instrumentation.ts importa a configuração.

export type BancoLocal = { host: string; porta: number };

/**
 * O banco que o driver (pg) vai usar de fato, se for local. Lê a URL com o mesmo parser do pg
 * (pg-connection-string). Nulo = remoto, URL inválida ou com host, hostaddr ou options.
 */
export function bancoLocalDaUrl(url: string): BancoLocal | null {
  if (!apontaParaLocalhost(url)) return null;

  let lida: ReturnType<typeof parse>;
  try {
    lida = parse(url);
  } catch {
    return null;
  }
  if (lida.options || (lida as { hostaddr?: unknown }).hostaddr) return null;
  if (!lida.host || !HOSTS_LOCAIS.has(lida.host)) return null;

  const porta = lida.port ? Number(lida.port) : 5432;
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) return null;
  return { host: lida.host, porta };
}

export function bancoLocal(url: string): boolean {
  return bancoLocalDaUrl(url) !== null;
}
