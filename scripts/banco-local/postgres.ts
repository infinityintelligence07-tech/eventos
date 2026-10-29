import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ARQUIVO_DE_CREDENCIAIS,
  type CredenciaisLocais,
  HOST_LOCAL,
  lerCredenciaisLocais,
  PASTA_DO_BANCO_LOCAL,
  PORTA_LOCAL,
  urlLocal,
} from "@/test/credenciais-locais";

// Cluster Postgres descartável em .banco-local/ (fora do git), só para desenvolvimento.
// Senha obrigatória (scram-sha-256), escuta só em 127.0.0.1 e socket numa pasta privada (doc 09 §9.1, B2).

const RAIZ = path.resolve(import.meta.dirname, "../..");
export const PASTA = PASTA_DO_BANCO_LOCAL;
const DADOS = path.join(PASTA, "dados");
const SOCKET = path.join(PASTA, "socket");
const LOG = path.join(PASTA, "postgres.log");

export const PORTA = PORTA_LOCAL;
export const NOME_BANCO = "eventos_local";

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

function rodando(): boolean {
  // pg_ctl status: 0 = rodando, 3 = parado.
  return existsSync(path.join(DADOS, "PG_VERSION")) && executar("pg_ctl", ["-D", DADOS, "status"]).codigo === 0;
}

function senhaNova(): string {
  return randomBytes(24).toString("hex");
}

/** Cria o cluster com senha. Um cluster antigo sem senha (auth trust) é apagado e criado de novo. */
function criarCluster(): CredenciaisLocais {
  if (rodando()) executar("pg_ctl", ["-D", DADOS, "-m", "fast", "stop"]);
  if (existsSync(DADOS)) {
    console.log("O cluster local antigo não tem senha: apagando .banco-local/dados e criando outro (os dados locais são recriados a seguir).");
    rmSync(DADOS, { recursive: true, force: true });
  }
  mkdirSync(PASTA, { recursive: true, mode: 0o700 });
  mkdirSync(SOCKET, { recursive: true, mode: 0o700 });

  const credenciais: CredenciaisLocais = { postgres: senhaNova(), app_eventos: senhaNova() };
  const arquivoDaSenha = path.join(PASTA, ".senha-initdb");
  writeFileSync(arquivoDaSenha, credenciais.postgres, { mode: 0o600 });
  try {
    console.log(`Criando cluster Postgres em ${path.relative(RAIZ, DADOS)}/ (scram-sha-256) ...`);
    const init = executar("initdb", [
      "-D", DADOS, "-U", "postgres", "--auth=scram-sha-256", `--pwfile=${arquivoDaSenha}`, "-E", "UTF8", "--no-locale",
    ]);
    if (init.codigo !== 0) throw new Error(`initdb falhou:\n${init.saida}`);
  } finally {
    unlinkSync(arquivoDaSenha);
  }
  appendFileSync(
    path.join(DADOS, "postgresql.conf"),
    `\n# banco:local\nlisten_addresses = '${HOST_LOCAL}'\nport = ${PORTA}\nunix_socket_directories = '${SOCKET}'\nunix_socket_permissions = 0700\npassword_encryption = 'scram-sha-256'\n`,
  );
  writeFileSync(ARQUIVO_DE_CREDENCIAIS, JSON.stringify(credenciais), { mode: 0o600 });
  chmodSync(ARQUIVO_DE_CREDENCIAIS, 0o600);
  return credenciais;
}

/** Cria o cluster (se não existir ou se for o antigo, sem senha) e sobe o Postgres (se estiver parado). */
export function garantirPostgres(): CredenciaisLocais {
  const existentes = existsSync(path.join(DADOS, "PG_VERSION")) ? lerCredenciaisLocais() : null;
  const credenciais = existentes ?? criarCluster();
  chmodSync(PASTA, 0o700);

  if (rodando()) return credenciais;
  console.log(`Subindo Postgres local em ${HOST_LOCAL}:${PORTA} ...`);
  const inicio = executar("pg_ctl", ["-D", DADOS, "-l", LOG, "-w", "start"]);
  if (inicio.codigo !== 0) {
    throw new Error(`pg_ctl start falhou (porta ${PORTA} ocupada?):\n${inicio.saida}\n${finalDoLog()}`);
  }
  return credenciais;
}

export function urlAdmin(credenciais: CredenciaisLocais, banco = "postgres"): string {
  return urlLocal("postgres", credenciais.postgres, banco);
}

export function urlDoApp(credenciais: CredenciaisLocais): string {
  return urlLocal("app_eventos", credenciais.app_eventos, NOME_BANCO);
}
