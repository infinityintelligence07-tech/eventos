// npm run sync:turmas:local [-- --a-partir-de=2026-01-01]
// Busca as turmas no IAM Control (URL e token do .env) e grava só no banco local (npm run banco:local).
// A produção não é tocada: as variáveis de banco definidas aqui têm precedência sobre as do .env.
import { spawn } from "node:child_process";

import { Client } from "pg";

import { urlLocalParaExibir } from "@/test/credenciais-locais";

import { garantirPostgres, NOME_BANCO, urlAdmin } from "./banco-local/postgres";

const credenciais = garantirPostgres();
const admin = new Client({ connectionString: urlAdmin(credenciais) });
await admin.connect();
const existe = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [NOME_BANCO])).rowCount;
await admin.end();
if (!existe) {
  console.error(`O banco ${NOME_BANCO} não existe. Rode antes: npm run banco:local`);
  process.exit(1);
}

// No local a sincronização entra como o dono do banco local: o papel app_eventos do app não cria evento.
const urlDoBanco = urlAdmin(credenciais, NOME_BANCO);
console.log(`Sincronizando turmas no banco local: ${urlLocalParaExibir("postgres", NOME_BANCO)}`);
const sincronizacao = spawn("node", ["--env-file-if-exists=.env", "--import", "tsx", "src/jobs/cli-sincronizar-turmas.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: urlDoBanco, WORKER_DATABASE_URL: urlDoBanco, EVENTOS_MODO: "local" },
});
sincronizacao.on("exit", (codigo, sinal) => {
  process.exit(codigo ?? (sinal ? 1 : 0));
});
