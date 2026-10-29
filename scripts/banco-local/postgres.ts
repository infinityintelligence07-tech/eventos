import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Cluster Postgres descartável em .banco-local/ (fora do git), só para desenvolvimento.

const RAIZ = path.resolve(import.meta.dirname, "../..");
export const PASTA = path.join(RAIZ, ".banco-local");
const DADOS = path.join(PASTA, "dados");
const LOG = path.join(PASTA, "postgres.log");

export const PORTA = 55432;
export const NOME_BANCO = "eventos_local";
export const URL_ADMIN = `postgresql://postgres@localhost:${PORTA}/postgres`;
export const URL_LOCAL = `postgresql://postgres@localhost:${PORTA}/${NOME_BANCO}`;

const BIN = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@15/bin";

function executar(programa: string, args: string[]): { codigo: number; saida: string } {
  const r = spawnSync(path.join(BIN, programa), args, { encoding: "utf8" });
  if (r.error) {
    throw new Error(`Não consegui executar ${programa} em ${BIN} (${r.error.message}). Ajuste PG_BIN.`);
  }
  return { codigo: r.status ?? 1, saida: `${r.stdout}${r.stderr}` };
}

function finalDoLog(): string {
  if (!existsSync(LOG)) return "";
  return readFileSync(LOG, "utf8").split("\n").slice(-15).join("\n");
}

/** Cria o cluster (se não existir) e sobe o Postgres na porta 55432 (se estiver parado). */
export function garantirPostgres(): void {
  if (!existsSync(path.join(DADOS, "PG_VERSION"))) {
    mkdirSync(PASTA, { recursive: true });
    console.log(`Criando cluster Postgres em ${path.relative(RAIZ, DADOS)}/ ...`);
    const init = executar("initdb", ["-D", DADOS, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"]);
    if (init.codigo !== 0) throw new Error(`initdb falhou:\n${init.saida}`);
  }

  // pg_ctl status: 0 = rodando, 3 = parado.
  if (executar("pg_ctl", ["-D", DADOS, "status"]).codigo === 0) return;

  console.log(`Subindo Postgres local na porta ${PORTA} ...`);
  const inicio = executar("pg_ctl", ["-D", DADOS, "-l", LOG, "-o", `-p ${PORTA} -k /tmp`, "-w", "start"]);
  if (inicio.codigo !== 0) {
    throw new Error(`pg_ctl start falhou (porta ${PORTA} ocupada?):\n${inicio.saida}\n${finalDoLog()}`);
  }
}
