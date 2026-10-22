import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa o ambiente
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL não definida");
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
