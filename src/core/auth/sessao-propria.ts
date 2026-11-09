import { createHmac, timingSafeEqual } from "node:crypto";

import { lerConfig } from "@/core/config/leitura";

// Sessão do login com e-mail e senha do IAM Control (docs/10). O IAM Control confere a senha; o Eventos guarda só o
// e-mail num cookie httpOnly assinado (HMAC-SHA256 com EVENTOS_SESSAO_SEGREDO) e com validade. Quem decide o acesso
// continua sendo core.usuario + perfil, lidos a cada requisição.

export const COOKIE_SESSAO = "eventos_sessao";
export const DURACAO_DA_SESSAO_EM_SEGUNDOS = 8 * 3600;

type Conteudo = { email: string; exp: number };

/** EVENTOS_SESSAO_SEGREDO; nulo = login com senha desligado neste ambiente. */
export function segredoDaSessao(): string | null {
  try {
    return lerConfig().EVENTOS_SESSAO_SEGREDO ?? null;
  } catch {
    return null;
  }
}

const base64url = (dados: Buffer | string) => Buffer.from(dados).toString("base64url");
const assinatura = (corpo: string, segredo: string) => createHmac("sha256", segredo).update(corpo).digest();

export function assinarSessao(email: string, segredo: string, agora: Date): string {
  const conteudo: Conteudo = { email: email.trim().toLowerCase(), exp: Math.floor(agora.getTime() / 1000) + DURACAO_DA_SESSAO_EM_SEGUNDOS };
  const corpo = base64url(JSON.stringify(conteudo));
  return `${corpo}.${base64url(assinatura(corpo, segredo))}`;
}

/** E-mail da sessão, se a assinatura confere e não venceu. Qualquer outra coisa: nulo. */
export function lerSessao(valor: string | undefined, segredo: string, agora: Date): string | null {
  if (!valor) return null;
  const [corpo, recebida, ...resto] = valor.split(".");
  if (!corpo || !recebida || resto.length > 0) return null;
  const esperada = assinatura(corpo, segredo);
  const dada = Buffer.from(recebida, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  try {
    const conteudo = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Partial<Conteudo>;
    if (typeof conteudo.email !== "string" || typeof conteudo.exp !== "number") return null;
    if (conteudo.exp * 1000 <= agora.getTime()) return null;
    return conteudo.email;
  } catch {
    return null;
  }
}
