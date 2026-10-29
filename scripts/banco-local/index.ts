// npm run banco:local
// Recria do zero o banco eventos_local (Postgres em .banco-local/, porta 55432): estrutura do GH + migrations,
// cópia somente leitura da produção (polos, locais, eventos, escalas e cadastros) e staff fictício.
// Origem: ORIGEM_DATABASE_URL ou, se vazia, a DATABASE_URL do .env. Nada é escrito na origem.
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import { criarDb, schema } from "@/core/db/database";
import { aplicarEstrutura } from "@/test/banco";
import { type CredenciaisLocais, lerCredenciaisLocais, urlLocalParaExibir } from "@/test/credenciais-locais";

import { colunasLocais, gravarCopia, lerProducao, semSegredo } from "./copiar-producao";
import { garantirPostgres, NOME_BANCO, urlAdmin } from "./postgres";
import { semear, USUARIOS_LOCAIS } from "./semear";

const TABELAS_RESUMO = [
  "core.polo", "core.usuario", "core.pessoa", "core.vinculo",
  "eventos.tipo_evento", "eventos.funcao", "eventos.regra_custo", "eventos.modelo_copy",
  "eventos.local", "eventos.evento", "eventos.escala",
  "eventos.pessoa_evento", "eventos.pessoa_funcao", "eventos.pessoa_veiculo",
  "eventos.enquete", "eventos.enquete_evento", "eventos.disponibilidade", "eventos.convocacao",
  "eventos.carona", "eventos.mensagem", "eventos.solicitacao_custo", "eventos.deslocamento", "eventos.custo_item",
  "eventos.registro_acao", "eventos.pedido_sdc", "eventos.trecho_voo", "eventos.hospedagem", "eventos.quarto",
  "eventos.quarto_ocupante", "eventos.configuracao",
];

const RESUMOS: { titulo: string; sql: string }[] = [
  {
    titulo: "Escalas dos cenários",
    sql: `SELECT e.codigo || '=' || e.status_escala AS item FROM eventos.evento e WHERE e.status_escala <> 'SEM_ESCALA'
            AND (e.status_escala <> 'RASCUNHO' OR e.pessoas_na_fila IS NOT NULL) ORDER BY e.inicio`,
  },
  { titulo: "Convocações por status", sql: "SELECT status || '=' || count(*) AS item FROM eventos.convocacao GROUP BY status ORDER BY status" },
  { titulo: "Mensagens por status", sql: "SELECT status || '=' || count(*) AS item FROM eventos.mensagem GROUP BY status ORDER BY status" },
  {
    titulo: "Caronas",
    sql: `SELECT 'caronas=' || (SELECT count(*) FROM eventos.carona) || ', passageiros=' || count(*) FILTER (WHERE carona_id IS NOT NULL)
                 || ', sem motorista=' || count(*) FILTER (WHERE carona_id IS NULL) AS item
            FROM eventos.convocacao WHERE deslocamento = 'CARONA'`,
  },
  { titulo: "Pedidos SDC", sql: "SELECT referencia || ' ' || tipo || ' ' || situacao AS item FROM eventos.pedido_sdc ORDER BY referencia" },
  {
    titulo: "Custos (auditoria/exceção)",
    sql: "SELECT protocolo || ' ' || status_auditoria || '/' || nivel_excecao AS item FROM eventos.solicitacao_custo ORDER BY protocolo",
  },
  { titulo: "Marcador eventos.ambiente", sql: "SELECT coalesce(current_setting('eventos.ambiente', true), '(ausente)') AS item" },
];

async function admin(credenciais: CredenciaisLocais, sql: string): Promise<void> {
  const cliente = new Client({ connectionString: urlAdmin(credenciais) });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

async function principal(urlOrigem: string): Promise<void> {
  const credenciais = garantirPostgres();
  const urlDoBanco = urlAdmin(credenciais, NOME_BANCO);

  console.log(`Recriando o banco ${NOME_BANCO} do zero (os dados locais anteriores serão apagados) ...`);
  await admin(credenciais, `DROP DATABASE IF EXISTS ${NOME_BANCO} WITH (FORCE)`);
  await admin(credenciais, `CREATE DATABASE ${NOME_BANCO}`);
  // Trava 3 da escrita (doc 07 §3.1): o app só escreve num banco com este marcador. A produção nunca o tem.
  await admin(credenciais, `ALTER DATABASE ${NOME_BANCO} SET eventos.ambiente = 'local'`);

  const { db, pool } = criarDb(urlDoBanco, "eventos-banco-local");
  try {
    console.log("Carregando estrutura do GH (fixture) e migrations do Eventos ...");
    await aplicarEstrutura(urlDoBanco, db);
    // O app local conecta como app_eventos (doc 09 §6.3): os grants e as políticas são exercitados de verdade.
    await admin(credenciais, `ALTER ROLE app_eventos WITH LOGIN PASSWORD '${credenciais.app_eventos}'`);

    const local = await pool.connect();
    try {
      console.log(
        `Lendo a produção (transação somente leitura) com ${process.env.ORIGEM_DATABASE_URL ? "ORIGEM_DATABASE_URL" : "a DATABASE_URL do .env (ORIGEM_DATABASE_URL vazia)"} ...`,
      );
      const copia = await lerProducao(urlOrigem, await colunasLocais(local));

      await local.query("BEGIN");
      const divergencias = await gravarCopia(local, copia);
      console.log("Semeando staff fictício, enquete e convocações ...");
      await semear({ sql: local, drizzle: drizzle({ client: local, schema }) });
      await local.query("COMMIT");

      console.log("\nCadastros substituídos pelos da produção (mesmos ids):");
      console.table(
        divergencias.map((d) => ({ tabela: d.tabela, "semente das migrations": d.semente, "produção": d.producao, "diferentes da semente": d.diferentes })),
      );

      const contagens: Record<string, number> = {};
      for (const tabela of TABELAS_RESUMO) {
        const r = await local.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela}`);
        contagens[tabela] = Number(r.rows[0]?.n ?? 0);
      }
      console.log("\nContagens no banco local:");
      console.table(contagens);
      for (const { titulo, sql } of RESUMOS) {
        const r = await local.query<{ item: string }>(sql);
        console.log(`${titulo}: ${r.rows.map((linha) => linha.item).join(", ") || "nenhum"}`);
      }
    } catch (erro) {
      await local.query("ROLLBACK").catch(() => undefined);
      throw erro;
    } finally {
      local.release();
    }
  } finally {
    await pool.end();
  }

  console.log(`\nPronto: ${urlLocalParaExibir("app_eventos", NOME_BANCO)} (senhas em .banco-local/credenciais.json)`);
  console.log("Usuários locais (Entrar como):");
  for (const u of USUARIOS_LOCAIS) console.log(`  ${u.nome.padEnd(20)} ${(u.perfil ?? "sem perfil").padEnd(14)} core.usuario.id = ${u.usuarioId}`);
  console.log("Suba o app com: npm run dev:local");
}

const urlOrigem = process.env.ORIGEM_DATABASE_URL || process.env.DATABASE_URL;
if (!urlOrigem) {
  console.error("Defina DATABASE_URL (no .env) ou ORIGEM_DATABASE_URL com o banco de origem.");
  process.exit(1);
}

try {
  await principal(urlOrigem);
} catch (erro: unknown) {
  let mensagem = semSegredo(erro instanceof Error ? erro.message : String(erro), urlOrigem);
  for (const senha of Object.values(lerCredenciaisLocais() ?? {})) mensagem = mensagem.split(senha).join("***");
  console.error(`\nFalhou: ${mensagem}`);
  process.exitCode = 1;
}
