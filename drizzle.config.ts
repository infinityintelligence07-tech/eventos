import { defineConfig } from "drizzle-kit";

import { bancoLocal } from "./src/core/config/banco-local";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa o ambiente
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL não definida");
}

// Trava (doc 07, risco R2): comandos que escrevem no banco só rodam em localhost, salvo confirmação explícita.
// Sai antes de conectar e sem mostrar a URL.
const COMANDOS_QUE_ESCREVEM = new Set(["migrate", "push", "drop", "up", "studio"]);
const comando = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (comando && COMANDOS_QUE_ESCREVEM.has(comando)) {
  // Mesmo parse da guarda de escrita: recusa host, hostaddr e options na URL, que desviam a conexão.
  if (!bancoLocal(url) && process.env.EVENTOS_CONFIRMO_MIGRAR_REMOTO !== "sim") {
    console.error(
      `drizzle-kit ${comando} recusado: a DATABASE_URL não aponta para localhost (ou desvia a conexão com host, hostaddr ou options).\n` +
        "Para rodar num banco remoto de propósito, defina EVENTOS_CONFIRMO_MIGRAR_REMOTO=sim nesta execução.",
    );
    process.exit(1);
  }
}

// Banco compartilhado iam-pessoas: este repo só gera migrations do schema "eventos".
// core, sensivel, gh e auditoria são do GH-System (docs/adr/0001-banco-pessoas-gh-eventos.md).
export default defineConfig({
  schema: "./src/core/db/schema/eventos/index.ts",
  out: "./src/core/db/migrations",
  dialect: "postgresql",
  schemaFilter: ["eventos"],
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations_eventos",
  },
  dbCredentials: { url },
});
