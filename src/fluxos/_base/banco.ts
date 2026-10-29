import { sql } from "drizzle-orm";

import {
  type LeituraDoServidor,
  type ModoDeEscrita,
  portaDoBancoConfigurado,
  type SituacaoDaEscrita,
  situacaoDoAmbiente,
  urlDeEscritaDeProducao,
  verificarAtor,
  verificarServidor,
} from "@/core/ambiente";
import type { AtorDaEscrita } from "@/core/autorizacao";
import { criarDb, type Db, type Executor } from "@/core/db/database";
import { bancoDoAmbiente, bancoParaLeitura } from "@/core/db/leitura";
import { contandoRegistros } from "@/core/db/registro-acao";

import { AcaoSemRegistroError, EscritaDesligadaError } from "./erros";

let escritaDeProducao: Db | undefined;

async function bancoDeEscrita(modo: ModoDeEscrita): Promise<Db> {
  switch (modo) {
    case "LOCAL":
      return bancoDoAmbiente();
    case "PRODUCAO": {
      const url = urlDeEscritaDeProducao();
      if (!url) throw new EscritaDesligadaError("Sem DATABASE_URL_ESCRITA.");
      escritaDeProducao ??= criarDb(url, "eventos-web-escrita", { max: 3 }).db;
      return escritaDeProducao;
    }
    default: {
      const desconhecido: never = modo;
      throw new Error(`modo de escrita desconhecido: ${String(desconhecido)}`);
    }
  }
}

/**
 * Trava 3: o que o servidor diz da conexão. Marcadores vêm do catálogo (pg_db_role_setting), não de current_setting,
 * que a sessão define com SET ou com `options=-c` na URL: o do banco atual (setrole = 0, modo LOCAL) e o do papel do
 * login (ALTER ROLE … SET, modo PRODUCAO). Papel = session_user: current_user muda com SET ROLE e `options=-c role=…`.
 * Nomes com pg_catalog (session_user é palavra-chave) para o search_path não desviar.
 */
export async function marcadorDoBanco(executor: Executor): Promise<LeituraDoServidor> {
  const resultado = await executor.execute<{
    marcador: string | null;
    marcador_do_papel: string | null;
    papel: string | null;
    endereco: string | null;
    porta: number | null;
  }>(sql`
    select
      (select pg_catalog.substr(item, pg_catalog.length('eventos.ambiente=') + 1)
         from pg_catalog.pg_db_role_setting configuracao, pg_catalog.unnest(configuracao.setconfig) item
        where configuracao.setrole = 0
          and configuracao.setdatabase = (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database())
          and pg_catalog.starts_with(item, 'eventos.ambiente=')
        limit 1) as marcador,
      (select pg_catalog.substr(item, pg_catalog.length('eventos.ambiente=') + 1)
         from pg_catalog.pg_db_role_setting configuracao, pg_catalog.unnest(configuracao.setconfig) item
        where configuracao.setrole = (select oid from pg_catalog.pg_roles where rolname = session_user)
          and configuracao.setdatabase in (0, (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database()))
          and pg_catalog.starts_with(item, 'eventos.ambiente=')
        order by configuracao.setdatabase desc
        limit 1) as marcador_do_papel,
      session_user::text as papel,
      pg_catalog.host(pg_catalog.inet_server_addr()) as endereco,
      pg_catalog.inet_server_port() as porta`);
  const linha = resultado.rows[0];
  return {
    marcador: linha?.marcador ?? null,
    marcadorDoPapel: linha?.marcador_do_papel ?? null,
    papel: linha?.papel ?? null,
    endereco: linha?.endereco ?? null,
    porta: linha?.porta ?? null,
  };
}

export type DependenciasDaGuarda = {
  /** Travas 1 e 2 (dizem o modo). */
  ambiente: () => SituacaoDaEscrita;
  /** Pool de escrita do modo. */
  banco: (modo: ModoDeEscrita) => Promise<Db>;
  /** Trava 3: o que o servidor diz da conexão. */
  servidor: (db: Db) => Promise<LeituraDoServidor>;
  /** Porta da DATABASE_URL, conferida com a do servidor no modo LOCAL. */
  portaEsperada: () => number | null;
};

export type GuardaDeEscrita = {
  /** Sem `ator` (undefined), confere só as travas 1 a 3: é o que o cabeçalho mostra. */
  situacao(ator?: AtorDaEscrita | null): Promise<SituacaoDaEscrita>;
  bancoParaEscrita(ator: AtorDaEscrita | null): Promise<Db>;
};

/**
 * Fail-closed: o banco só é tocado depois das travas 1 e 2; a 3 é lida uma vez por modo e guardada só quando confere;
 * a 4 (ator) é conferida a cada pedido. Erro na leitura do servidor recusa, e a próxima chamada lê de novo.
 */
export function criarGuardaDeEscrita(dependencias: DependenciasDaGuarda): GuardaDeEscrita {
  const conferidos = new Set<ModoDeEscrita>();

  async function travasDoAmbienteEDoServidor(): Promise<SituacaoDaEscrita> {
    const ambiente = dependencias.ambiente();
    if (!ambiente.liberada) return ambiente;
    if (conferidos.has(ambiente.modo)) return ambiente;
    try {
      const leitura = await dependencias.servidor(await dependencias.banco(ambiente.modo));
      const servidor = verificarServidor(leitura, ambiente.modo === "LOCAL" ? dependencias.portaEsperada() : null, ambiente.modo);
      if (servidor.liberada) conferidos.add(ambiente.modo);
      return servidor;
    } catch {
      return { liberada: false, trava: ambiente.modo === "LOCAL" ? "MARCADOR_NO_BANCO" : "MARCADOR_NO_PAPEL", motivo: "Não foi possível ler o servidor do banco." };
    }
  }

  async function situacao(ator?: AtorDaEscrita | null): Promise<SituacaoDaEscrita> {
    const atual = await travasDoAmbienteEDoServidor();
    if (!atual.liberada || ator === undefined) return atual;
    return verificarAtor(atual.modo, ator);
  }

  return {
    situacao,
    async bancoParaEscrita(ator) {
      const atual = await situacao(ator);
      if (!atual.liberada) throw new EscritaDesligadaError(atual.motivo);
      return dependencias.banco(atual.modo);
    },
  };
}

const guarda = criarGuardaDeEscrita({
  ambiente: situacaoDoAmbiente,
  banco: bancoDeEscrita,
  servidor: marcadorDoBanco,
  portaEsperada: portaDoBancoConfigurado,
});

export { bancoParaLeitura };

/** Leitura numa transação explicitamente somente leitura (mais de uma consulta com o mesmo instantâneo). */
export async function lerEmTransacao<T>(trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  return (await bancoParaLeitura()).transaction(trabalho, { accessMode: "read only" });
}

/** O único caminho para escrever: as quatro travas; lança EscritaDesligadaError se alguma estiver fechada. */
export function bancoParaEscrita(ator: AtorDaEscrita): Promise<Db> {
  return guarda.bancoParaEscrita(ator);
}

/** Travas 1 a 3, para o cabeçalho e as páginas mostrarem "somente leitura" (e o modo). Nunca lança. */
export function situacaoDaEscrita(): Promise<SituacaoDaEscrita> {
  return guarda.situacao();
}

const LIMITE_DA_TRANSACAO = sql`set local statement_timeout = '15s'`;

/**
 * A transação de um caso de uso num banco já liberado: limite de 15 s e pelo menos um registrarAcao dentro
 * (docs/09 §7.2); sem registro, desfaz com AcaoSemRegistroError. Os testes de integração usam esta função direto.
 */
export async function transacaoNoBanco<T>(db: Db, trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(LIMITE_DA_TRANSACAO);
    const { resultado, registros } = await contandoRegistros(() => trabalho(tx));
    if (registros === 0) throw new AcaoSemRegistroError();
    return resultado;
  });
}

/** Transação de escrita do caso de uso (docs/09 §5.2): passa pelas quatro travas. Tudo usa o `tx` recebido. */
export async function transacao<T>(ator: AtorDaEscrita, trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  return transacaoNoBanco(await bancoParaEscrita(ator), trabalho);
}
