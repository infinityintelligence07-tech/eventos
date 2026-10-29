import { sql } from "drizzle-orm";

import { type LeituraDoServidor, portaDoBancoConfigurado, type SituacaoDaEscrita, situacaoDoAmbiente, verificarServidor } from "@/core/ambiente";
import type { Db, Executor } from "@/core/db/database";

import { EscritaDesligadaError } from "./erros";

async function bancoDoAmbiente(): Promise<Db> {
  // Única exceção à regra de imports no topo (docs/07 §2.2): importar o cliente no topo
  // faria o build do Next exigir DATABASE_URL, como em eventos/repository/padrao.ts.
  const { db } = await import("@/core/db/client");
  return db;
}

/**
 * Trava 3: o marcador vem do catálogo (pg_db_role_setting do banco atual), não de current_setting, que a sessão
 * define com SET ou com `options=-c` na URL. Nomes qualificados com pg_catalog para o search_path não desviar.
 */
export async function marcadorDoBanco(executor: Executor): Promise<LeituraDoServidor> {
  const resultado = await executor.execute<{ marcador: string | null; endereco: string | null; porta: number | null }>(sql`
    select
      (select pg_catalog.substr(item, pg_catalog.length('eventos.ambiente=') + 1)
         from pg_catalog.pg_db_role_setting configuracao, pg_catalog.unnest(configuracao.setconfig) item
        where configuracao.setrole = 0
          and configuracao.setdatabase = (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database())
          and pg_catalog.starts_with(item, 'eventos.ambiente=')
        limit 1) as marcador,
      pg_catalog.host(pg_catalog.inet_server_addr()) as endereco,
      pg_catalog.inet_server_port() as porta`);
  const linha = resultado.rows[0];
  return { marcador: linha?.marcador ?? null, endereco: linha?.endereco ?? null, porta: linha?.porta ?? null };
}

export type DependenciasDaGuarda = {
  /** Travas 1 e 2. */
  ambiente: () => SituacaoDaEscrita;
  banco: () => Promise<Db>;
  /** Trava 3: o que o servidor diz da conexão. */
  servidor: (db: Db) => Promise<LeituraDoServidor>;
  /** Porta da DATABASE_URL, conferida com a do servidor. */
  portaEsperada: () => number | null;
};

export type GuardaDeEscrita = {
  situacao(): Promise<SituacaoDaEscrita>;
  bancoParaEscrita(): Promise<Db>;
};

/**
 * Fail-closed: o banco só é tocado depois das travas 1 e 2; a trava 3 é lida uma vez e guardada quando confere.
 * Marcador ausente, servidor fora do loopback, porta diferente ou erro na leitura recusam, e a próxima chamada lê de novo.
 */
export function criarGuardaDeEscrita(dependencias: DependenciasDaGuarda): GuardaDeEscrita {
  let marcadorConferido = false;

  async function situacao(): Promise<SituacaoDaEscrita> {
    const ambiente = dependencias.ambiente();
    if (!ambiente.liberada) return ambiente;
    if (marcadorConferido) return ambiente;
    try {
      const servidor = verificarServidor(await dependencias.servidor(await dependencias.banco()), dependencias.portaEsperada());
      marcadorConferido = servidor.liberada;
      return servidor;
    } catch {
      return { liberada: false, trava: "MARCADOR_NO_BANCO", motivo: "Não foi possível ler o marcador do banco." };
    }
  }

  return {
    situacao,
    async bancoParaEscrita() {
      const atual = await situacao();
      if (!atual.liberada) throw new EscritaDesligadaError(atual.motivo);
      return dependencias.banco();
    },
  };
}

const guarda = criarGuardaDeEscrita({
  ambiente: situacaoDoAmbiente,
  banco: bancoDoAmbiente,
  servidor: marcadorDoBanco,
  portaEsperada: portaDoBancoConfigurado,
});

/** Leitura não tem trava: o Calendário lê a produção. */
export function bancoParaLeitura(): Promise<Db> {
  return bancoDoAmbiente();
}

/** O único caminho para escrever. Lança EscritaDesligadaError se alguma das três travas estiver fechada. */
export function bancoParaEscrita(): Promise<Db> {
  return guarda.bancoParaEscrita();
}

/** As três travas, para o cabeçalho e as páginas mostrarem "somente leitura". Nunca lança. */
export function situacaoDaEscrita(): Promise<SituacaoDaEscrita> {
  return guarda.situacao();
}

/** Abre uma transação de escrita (passa pelas três travas). Tudo do caso de uso usa o `tx` recebido. */
export async function transacao<T>(trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  const db = await bancoParaEscrita();
  return db.transaction(trabalho);
}
