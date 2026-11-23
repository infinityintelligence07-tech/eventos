import { headers } from "next/headers";

import { lerConfig } from "@/core/config/leitura";

/**
 * Origem pública do site, para montar links que o time copia e envia. Usa EVENTOS_URL_PUBLICA (obrigatória em
 * produção); fora dela, cai na origem da requisição.
 */
export async function enderecoDoSite(): Promise<string | null> {
  const configurada = lerConfig().EVENTOS_URL_PUBLICA;
  if (configurada) return new URL(configurada).origin;
  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");
  if (!host) return null;
  return `${cabecalhos.get("x-forwarded-proto") ?? "http"}://${host}`;
}
