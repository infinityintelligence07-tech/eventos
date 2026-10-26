import { readFileSync } from "node:fs";
import path from "node:path";

// Lê os dados iniciais direto da migration, para os testes garantirem que o que está no banco funciona.
const MIGRATION = path.resolve(
  import.meta.dirname,
  "../core/db/migrations/0002_seguranca-protocolo-e-referencias.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

export function regrasVagasDaMigration(): Record<string, unknown> {
  const regras: Record<string, unknown> = {};
  for (const [, sigla, json] of sql.matchAll(/\('([A-Z_]+)', '[^']*', (?:\d+|NULL), '(\{.*?\})'\)/gs)) {
    regras[sigla!] = JSON.parse(json!);
  }
  return regras;
}

export function modelosCopyDaMigration(): Record<string, string> {
  const modelos: Record<string, string> = {};
  for (const [, tipo, corpo] of sql.matchAll(/\('(ESCALACAO|HOSPEDAGEM|LEMBRETE|ALTERACAO)', '[^']*', '((?:[^']|'')*)'\)/g)) {
    modelos[tipo!] = corpo!.replaceAll("''", "'");
  }
  return modelos;
}
