import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verificarAmbiente } from "@/core/ambiente";
import { criarDb, type Db } from "@/core/db/database";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";
import { lerCredenciaisLocais, urlLocal } from "@/test/credenciais-locais";

import { criarGuardaDeEscrita, marcadorDoBanco } from "../banco";
import { EscritaDesligadaError } from "../erros";

// Guarda do modo PRODUCAO contra um servidor de verdade, com o papel app_eventos da migration 0005.
// O marcador `producao` vai em ALTER ROLE … IN DATABASE <banco de teste>: some com o banco e não toca no
// app_eventos do banco local. O papel é o do login (session_user): precisa da senha do app_eventos do banco local.
const credenciais = lerCredenciaisLocais();

describe.skipIf(!TEST_DATABASE_URL || !credenciais)("guarda do modo PRODUCAO no banco", () => {
  let banco: BancoDeTeste;
  let nome: string;
  const pools: Pool[] = [];
  const conexoes = {} as Record<"app" | "papelPelaUrl", Db>;
  const sessao = { usuarioId: "u", pessoaId: null, origem: "SESSAO" as const };

  const conectar = (url: string): Db => {
    const { db, pool } = criarDb(url, "eventos-teste-producao", { max: 1 });
    pools.push(pool);
    return db;
  };
  const ler = (db: Db, papel?: string) => async () =>
    db.transaction(async (tx) => {
      if (papel) await tx.execute(sql.raw(`set local role ${papel}`));
      return marcadorDoBanco(tx);
    });
  const guarda = (servidor: ReturnType<typeof ler>) =>
    criarGuardaDeEscrita({
      ambiente: () => ({ liberada: true, modo: "PRODUCAO" }),
      banco: async () => conexoes.app,
      servidor,
      portaEsperada: () => null,
    });

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    nome = ((await banco.sql("select current_database() as nome")) as [{ nome: string }])[0].nome;
    conexoes.app = conectar(urlLocal("app_eventos", credenciais!.app_eventos, nome));
    const papelPelaUrl = new URL(TEST_DATABASE_URL!);
    papelPelaUrl.pathname = `/${nome}`;
    papelPelaUrl.searchParams.set("options", "-c role=app_eventos");
    conexoes.papelPelaUrl = conectar(papelPelaUrl.toString());
  }, 60_000);

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    await banco?.encerrar();
  });

  it("app_eventos lê o catálogo da guarda (pg_db_role_setting, pg_roles) sem ser superusuário", async () => {
    await expect(ler(conexoes.app)()).resolves.toMatchObject({ papel: "app_eventos", marcador: null, marcadorDoPapel: null });
  });

  it("sem o marcador producao no papel: recusa", async () => {
    await expect(guarda(ler(conexoes.app)).situacao(sessao)).resolves.toMatchObject({ liberada: false, trava: "MARCADOR_NO_PAPEL" });
  });

  it("login diferente de app_eventos recusa, mesmo virando app_eventos por SET ROLE ou options=-c role=app_eventos", async () => {
    await banco.sql(`alter role app_eventos in database ${nome} set eventos.ambiente = 'producao'`);
    const recusada = { liberada: false, trava: "PAPEL_DE_ESCRITA" };
    await expect(guarda(ler(banco.db)).situacao(sessao)).resolves.toMatchObject(recusada);
    await expect(guarda(ler(banco.db, "app_eventos")).situacao(sessao)).resolves.toMatchObject(recusada);
    await expect(guarda(ler(banco.db, "app_eventos_leitura")).situacao(sessao)).resolves.toMatchObject(recusada);

    const pelaUrl = await ler(conexoes.papelPelaUrl)();
    expect(pelaUrl).toMatchObject({ papel: "postgres", marcadorDoPapel: null });
    expect(((await conexoes.papelPelaUrl.execute<{ papel: string }>(sql`select current_user::text as papel`)).rows[0])?.papel).toBe("app_eventos");
    await expect(guarda(ler(conexoes.papelPelaUrl)).situacao(sessao)).resolves.toMatchObject(recusada);
  });

  it("a URL de escrita com options, host ou hostaddr é recusada já no ambiente", () => {
    const ambiente = { NODE_ENV: "production" as const, EVENTOS_ESCRITA: "producao" as const, DATABASE_URL: "postgresql://leitura:x@db.exemplo.com/postgres" };
    for (const desvio of ["options=-c%20role%3Dapp_eventos", "OPTIONS=-c%20role%3Dapp_eventos", "host=outro.exemplo.com", "hostaddr=10.0.0.5"]) {
      expect(verificarAmbiente({ ...ambiente, DATABASE_URL_ESCRITA: `postgresql://postgres:y@db.exemplo.com/postgres?${desvio}` })).toMatchObject({
        liberada: false,
        trava: "PAPEL_DE_ESCRITA",
      });
    }
    expect(verificarAmbiente({ ...ambiente, DATABASE_URL_ESCRITA: "postgresql://app_eventos:y@db.exemplo.com:6543/postgres?sslmode=require" })).toEqual({
      liberada: true,
      modo: "PRODUCAO",
    });
  });

  it("app_eventos com o marcador producao: libera para ator de sessão; ator LOCAL recusa", async () => {
    const liberada = guarda(ler(conexoes.app));
    await expect(liberada.situacao(sessao)).resolves.toEqual({ liberada: true, modo: "PRODUCAO" });
    await expect(liberada.bancoParaEscrita({ ...sessao, origem: "LOCAL" })).rejects.toBeInstanceOf(EscritaDesligadaError);
  });

  it("com o marcador local também no banco: recusa (não é a produção)", async () => {
    await banco.sql(`alter database ${nome} set eventos.ambiente = 'local'`);
    await expect(guarda(ler(conexoes.app)).situacao(sessao)).resolves.toMatchObject({ liberada: false, trava: "MARCADOR_NO_PAPEL" });
  });

  it("SET de sessão não cria o marcador do papel", async () => {
    await banco.sql(`alter role app_eventos in database ${nome} reset eventos.ambiente`);
    const leitura = await conexoes.app.transaction(async (tx) => {
      await tx.execute(sql`set local eventos.ambiente = 'producao'`);
      return marcadorDoBanco(tx);
    });
    expect(leitura.marcadorDoPapel).toBeNull();
  });
});
