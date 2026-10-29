import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoLocal } from "@/core/config/banco-local";
import { criarDb, type Db } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { criarGuardaDeEscrita, marcadorDoBanco } from "../banco";
import { EscritaDesligadaError } from "../erros";

describe.skipIf(!TEST_DATABASE_URL)("base dos fluxos no banco", () => {
  let banco: BancoDeTeste;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  const PORTA = () => Number(new URL(TEST_DATABASE_URL!).port || 5432);
  const ATOR = { usuarioId: "7e570000-0000-7000-8000-000000000001", pessoaId: null, origem: "LOCAL" as const };
  const guardaDe = (db: Db) =>
    criarGuardaDeEscrita({ ambiente: () => ({ liberada: true, modo: "LOCAL" }), banco: async () => db, servidor: marcadorDoBanco, portaEsperada: PORTA });
  const urlDoBanco = async (parametros = "") => {
    const [{ nome }] = (await banco.sql("select current_database() as nome")) as [{ nome: string }];
    const url = new URL(TEST_DATABASE_URL!);
    url.pathname = `/${nome}`;
    return { nome, url: `${url.toString()}${parametros}` };
  };

  it("banco sem o marcador: a guarda recusa mesmo com o ambiente liberado", async () => {
    expect(await marcadorDoBanco(banco.db)).toMatchObject({ marcador: null, porta: PORTA() });
    await expect(guardaDe(banco.db).bancoParaEscrita(ATOR)).rejects.toBeInstanceOf(EscritaDesligadaError);
  });

  it("SET eventos.ambiente na sessão não forja o marcador", async () => {
    await banco.db.transaction(async (tx) => {
      await tx.execute(sql`set local eventos.ambiente = 'local'`);
      const sessao = await tx.execute<{ valor: string }>(sql`select current_setting('eventos.ambiente', true) as valor`);
      expect(sessao.rows[0]?.valor).toBe("local");
      expect((await marcadorDoBanco(tx)).marcador).toBeNull();
    });
  });

  it("options=-c eventos.ambiente=local na URL não forja o marcador (e a trava 2 recusa a URL)", async () => {
    const { url } = await urlDoBanco("?options=-c%20eventos.ambiente%3Dlocal");
    expect(bancoLocal(url)).toBe(false);
    const forjada = criarDb(url, "eventos-teste-forjado");
    try {
      const sessao = await forjada.db.execute<{ valor: string }>(sql`select current_setting('eventos.ambiente', true) as valor`);
      expect(sessao.rows[0]?.valor).toBe("local");
      await expect(guardaDe(forjada.db).bancoParaEscrita(ATOR)).rejects.toBeInstanceOf(EscritaDesligadaError);
    } finally {
      await forjada.pool.end();
    }
  });

  it("com o marcador gravado no banco (como o banco:local faz), libera", async () => {
    const { nome, url } = await urlDoBanco();
    await banco.sql(`alter database ${nome} set eventos.ambiente = 'local'`);
    const nova = criarDb(url, "eventos-teste-marcador");
    try {
      expect(await marcadorDoBanco(nova.db)).toMatchObject({ marcador: "local", porta: PORTA() });
      await expect(guardaDe(nova.db).bancoParaEscrita(ATOR)).resolves.toBe(nova.db);
      // Porta diferente da configurada (como num túnel) recusa.
      const tunel = criarGuardaDeEscrita({ ambiente: () => ({ liberada: true, modo: "LOCAL" }), banco: async () => nova.db, servidor: marcadorDoBanco, portaEsperada: () => PORTA() + 1 });
      await expect(tunel.bancoParaEscrita(ATOR)).rejects.toBeInstanceOf(EscritaDesligadaError);
    } finally {
      await nova.pool.end();
    }
  });

  it("modo PRODUCAO numa conexão que não é app_eventos (papel errado): recusa", async () => {
    const leitura = await marcadorDoBanco(banco.db);
    expect(leitura.papel).not.toBe("app_eventos");
    const producao = criarGuardaDeEscrita({
      ambiente: () => ({ liberada: true, modo: "PRODUCAO" }),
      banco: async () => banco.db,
      servidor: marcadorDoBanco,
      portaEsperada: () => null,
    });
    const sessao = { usuarioId: "u", pessoaId: null, origem: "SESSAO" as const };
    await expect(producao.situacao(sessao)).resolves.toMatchObject({ liberada: false, trava: "PAPEL_DE_ESCRITA" });
    await expect(producao.bancoParaEscrita(sessao)).rejects.toBeInstanceOf(EscritaDesligadaError);
  });

  it("registrarAcao grava dentro da transação e some no rollback", async () => {
    const [evento] = (await banco.sql(
      `insert into eventos.evento (nome, inicio, fim, status) values ('Evento', now(), now(), 'PLANEJADO') returning id`,
    )) as { id: string }[];
    const [usuario] = (await banco.sql(`insert into core.usuario (email) values ('u@exemplo.test') returning id`)) as { id: string }[];
    const usuarioId = usuario!.id;

    await banco.db.transaction(async (tx) => {
      await registrarAcao(tx, {
        entidade: "ESCALA_DO_EVENTO",
        entidadeId: evento!.id,
        eventoId: evento!.id,
        acao: "DEVOLVIDA",
        statusDe: "AGUARDANDO_APROVACAO",
        statusPara: "DEVOLVIDA",
        comentario: "Faltam duas vagas.",
        usuarioId,
        dados: { vagas: 22 },
      });
    });
    await expect(
      banco.db.transaction(async (tx) => {
        await registrarAcao(tx, { entidade: "CONVOCACAO", entidadeId: evento!.id, acao: "RESPOSTA_REGISTRADA", usuarioId });
        throw new Error("desfaz");
      }),
    ).rejects.toThrow("desfaz");

    const linhas = (await banco.sql(`select acao, comentario, dados, usuario_id from eventos.registro_acao where entidade_id = $1`, [
      evento!.id,
    ])) as { acao: string; comentario: string; dados: unknown; usuario_id: string }[];
    expect(linhas).toEqual([{ acao: "DEVOLVIDA", comentario: "Faltam duas vagas.", dados: { vagas: 22 }, usuario_id: usuarioId }]);
  });
});
