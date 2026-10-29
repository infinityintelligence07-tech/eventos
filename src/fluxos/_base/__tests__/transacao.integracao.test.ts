import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db, Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

// transacao(ator, …) de verdade no modo LOCAL: o banco do ambiente vira o banco de teste (com o marcador local).
const ambiente = vi.hoisted(() => ({ db: null as Db | null, porta: 0 }));

vi.mock("@/core/db/client", () => ({
  get db() {
    return ambiente.db;
  },
}));
vi.mock("@/core/ambiente", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  situacaoDoAmbiente: () => ({ liberada: true, modo: "LOCAL" }),
  portaDoBancoConfigurado: () => ambiente.porta,
  modoLocal: () => true,
}));

const { AcaoSemRegistroError, transacao } = await import("..");

describe.skipIf(!TEST_DATABASE_URL)("transacao(ator, trabalho)", () => {
  let banco: BancoDeTeste;
  let usuarioId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  const quantos = async (nome: string) =>
    ((await banco.sql(`select count(*)::int as n from eventos.local where nome = $1`, [nome])) as [{ n: number }])[0].n;
  const inserirLocal = (tx: Executor, nome: string) =>
    tx.execute(sql`insert into eventos.local (nome, cidade, uf) values (${nome}, 'Manaus', 'AM') returning id`);

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    const [{ nome }] = (await banco.sql("select current_database() as nome")) as [{ nome: string }];
    await banco.sql(`alter database ${nome} set eventos.ambiente = 'local'`);
    ambiente.db = banco.db;
    ambiente.porta = Number(new URL(TEST_DATABASE_URL!).port || 5432);
    usuarioId = ((await banco.sql(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)) as [{ id: string }])[0].id;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("sem registrarAcao, desfaz e acusa erro de programação", async () => {
    await expect(transacao(ator(), (tx) => inserirLocal(tx, "Sem registro"))).rejects.toBeInstanceOf(AcaoSemRegistroError);
    expect(await quantos("Sem registro")).toBe(0);
  });

  it("com registrarAcao (até dentro de savepoint), grava", async () => {
    await transacao(ator(), async (tx) => {
      const { rows } = await inserirLocal(tx, "Com registro");
      await tx.transaction(async (savepoint) => {
        await registrarAcao(savepoint, { entidade: "LOCAL", entidadeId: (rows[0] as { id: string }).id, acao: "LOCAL_CRIADO", usuarioId });
      });
    });
    expect(await quantos("Com registro")).toBe(1);
  });

  it("limita a transação a 15 s (SET LOCAL statement_timeout)", async () => {
    const limite = await transacao(ator(), async (tx) => {
      const { rows } = await tx.execute<{ limite: string }>(sql`select current_setting('statement_timeout') as limite`);
      await registrarAcao(tx, { entidade: "LOCAL", entidadeId: usuarioId, acao: "LOCAL_ALTERADO", usuarioId });
      return rows[0]!.limite;
    });
    expect(limite).toBe("15s");
  });
});
