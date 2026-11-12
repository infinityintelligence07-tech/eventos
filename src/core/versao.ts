import { readFileSync } from "node:fs";
import path from "node:path";

/** Fora de uma imagem publicada (dev, testes) não há arquivo de versão. */
export const VERSAO_SEM_BUILD = "desenvolvimento";

/**
 * Impressão digital do código em execução, gravada no build da imagem (scripts/impressao-do-codigo.sh → /app/.versao).
 * O fluxo Deploy compara este valor com o do commit publicado para saber se o serviço subiu mesmo com o código novo.
 */
export function versaoDoCodigo(pasta: string = process.cwd()): string {
  try {
    const valor = readFileSync(path.join(pasta, ".versao"), "utf8").trim();
    return /^[0-9a-f]{16}$/.test(valor) ? valor : VERSAO_SEM_BUILD;
  } catch {
    return VERSAO_SEM_BUILD;
  }
}
