// npm run dev:local [-- -p 3001]
// Sobe o next dev apontando para o banco local (npm run banco:local). O .env continua sendo lido pelo Next,
// mas as variáveis definidas aqui têm precedência e o arquivo não é alterado.
import { spawn } from "node:child_process";

import { Client } from "pg";

import { urlLocalParaExibir } from "@/test/credenciais-locais";

import { garantirPostgres, NOME_BANCO, urlAdmin, urlDoApp } from "./banco-local/postgres";

const credenciais = garantirPostgres();
// O app conecta como app_eventos (mínimo privilégio, doc 09 §6); a senha fica em .banco-local/ e não é exibida.
const urlDoBanco = urlDoApp(credenciais);

const admin = new Client({ connectionString: urlAdmin(credenciais) });
await admin.connect();
const existe = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [NOME_BANCO])).rowCount;
await admin.end();
if (!existe) {
  console.error(`O banco ${NOME_BANCO} não existe. Rode antes: npm run banco:local`);
  process.exit(1);
}

function esconderHost(args: string[], indice: number): boolean {
  const atual = args[indice]!;
  if (atual === "-H" || atual === "--hostname" || atual.startsWith("--hostname=")) return true;
  return args[indice - 1] === "-H" || args[indice - 1] === "--hostname";
}

const outroHost = process.argv.slice(2).some((_, i, args) => esconderHost(args, i));
if (outroHost) console.warn("Ignorando -H/--hostname: o modo local só escuta em 127.0.0.1.");

console.log(`Modo local: DATABASE_URL=${urlLocalParaExibir("app_eventos", NOME_BANCO)} (http://127.0.0.1)`);
// Sem login: o servidor só atende nesta máquina (127.0.0.1), nunca na rede local.
const next = spawn("next", ["dev", "-H", "127.0.0.1", ...process.argv.slice(2).filter((_, i, args) => !esconderHost(args, i))], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: urlDoBanco, WORKER_DATABASE_URL: urlDoBanco, EVENTOS_MODO: "local" },
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => next.kill(sinal));
}
next.on("exit", (codigo, sinal) => {
  process.exit(codigo ?? (sinal ? 1 : 0));
});
