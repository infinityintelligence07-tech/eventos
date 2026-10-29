import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Senhas do Postgres local, geradas pelo banco:local em .banco-local/ (fora do Git). Nunca vão para log ou saída.

export const PASTA_DO_BANCO_LOCAL = path.resolve(import.meta.dirname, "../../.banco-local");
export const ARQUIVO_DE_CREDENCIAIS = path.join(PASTA_DO_BANCO_LOCAL, "credenciais.json");
export const HOST_LOCAL = "127.0.0.1";
export const PORTA_LOCAL = 55432;

export type CredenciaisLocais = { postgres: string; app_eventos: string };

export function lerCredenciaisLocais(): CredenciaisLocais | null {
  if (!existsSync(ARQUIVO_DE_CREDENCIAIS)) return null;
  const lido = JSON.parse(readFileSync(ARQUIVO_DE_CREDENCIAIS, "utf8")) as Partial<CredenciaisLocais>;
  return typeof lido.postgres === "string" && typeof lido.app_eventos === "string"
    ? { postgres: lido.postgres, app_eventos: lido.app_eventos }
    : null;
}

export function urlLocal(usuario: keyof CredenciaisLocais, senha: string, banco: string): string {
  return `postgresql://${usuario}:${encodeURIComponent(senha)}@${HOST_LOCAL}:${PORTA_LOCAL}/${banco}`;
}

/** URL sem a senha, para mostrar no terminal. */
export function urlLocalParaExibir(usuario: keyof CredenciaisLocais, banco: string): string {
  return `postgresql://${usuario}:***@${HOST_LOCAL}:${PORTA_LOCAL}/${banco}`;
}
