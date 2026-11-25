import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0019_masterclass-e-data-real";

// A 0019 roda sobre pedidos que já existem. O banco de teste nasce com ela aplicada, então o teste volta com o
// .down.sql, grava pedidos como eram antes e aplica de novo. Cada arquivo vai numa chamada só: o Postgres roda o lote
// numa transação implícita e desfaz tudo se um comando falha.
describe.skipIf(!TEST_DATABASE_URL)("migration 0019 (turnê de Masterclass e data real) sobre dados existentes", () => {
  let banco: BancoDeTeste;
  let eventoId: string;
  let outroEventoId: string;
  let pessoaId: string;
  const pedidos: Record<string, string> = {};

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const subir = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  const descer = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8"));
  const colunasNovas = async () =>
    ((await banco.sql(
      `select column_name from information_schema.columns where table_schema = 'eventos' and table_name = 'pedido_sdc' and column_name in ('evento_volta_id', 'data_solicitacao', 'data_compra') order by 1`,
    )) as { column_name: string }[]).map((linha) => linha.column_name);
  const antigas = `id, tipo, situacao, evento_id, pessoa_id, valor_centavos, forma_pagamento, solicitado_em, emitido_em, atualizado_em`;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    eventoId = (await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now() + interval '10 days', now() + interval '12 days', 'PLANEJADO') returning id`)).id as string;
    outroEventoId = (await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Outro evento', now() + interval '14 days', now() + interval '15 days', 'PLANEJADO') returning id`)).id as string;
    pessoaId = (await um(`insert into core.pessoa (nome_completo) values ('Pessoa de teste') returning id`)).id as string;
    const novo = async (nome: string, colunas: string, valores: string, params: unknown[] = []) => {
      pedidos[nome] = (await um(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id${colunas}) values ('VOO', $1, $2${valores}) returning id`, [eventoId, pessoaId, ...params])).id as string;
    };
    // Pedido da madrugada de 02/10 em UTC (ainda 01/10 em São Paulo), sem compra.
    await novo("pedido", `, solicitado_em`, `, '2026-10-02T02:30:00Z'`);
    // Comprado dias depois.
    await novo("emitido", `, situacao, valor_centavos, solicitado_em, emitido_em`, `, 'EMITIDO', 98000, '2026-09-10T15:00:00Z', '2026-09-18T15:00:00Z'`);
    // Alterado depois de emitido: guarda a emissão anterior.
    await novo("alterado", `, situacao, valor_centavos, solicitado_em, emitido_em`, `, 'ALTERADO', 50000, '2026-09-01T15:00:00Z', '2026-09-05T15:00:00Z'`);
    // Dado fora do comum: emissão gravada antes da solicitação (acerto manual no banco).
    await novo("invertido", `, situacao, valor_centavos, solicitado_em, emitido_em`, `, 'EMITIDO', 70000, '2026-08-20T15:00:00Z', '2026-08-10T15:00:00Z'`);
    pedidos.hospedagem = (await um(`insert into eventos.pedido_sdc (tipo, evento_id, situacao, valor_centavos, forma_pagamento, solicitado_em, emitido_em) values ('HOSPEDAGEM', $1, 'EMITIDO', 240000, 'Faturado SDC', '2026-09-12T15:00:00Z', '2026-09-12T18:00:00Z') returning id`, [eventoId])).id as string;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0019: sem evento da volta e sem as datas de negócio", async () => {
    expect(await colunasNovas()).toEqual([]);
  });

  it("aplica sem mexer no que já existe e tira as datas dos instantes de lançamento, no fuso de São Paulo", async () => {
    const antes = await banco.sql(`select ${antigas} from eventos.pedido_sdc order by id`);
    await subir();
    expect(await colunasNovas()).toEqual(["data_compra", "data_solicitacao", "evento_volta_id"]);
    expect(await banco.sql(`select ${antigas} from eventos.pedido_sdc order by id`)).toEqual(antes);

    const datas = Object.fromEntries(
      ((await banco.sql(`select id, data_solicitacao::text, data_compra::text, evento_volta_id from eventos.pedido_sdc`)) as Record<string, string | null>[]).map((linha) => [
        Object.keys(pedidos).find((nome) => pedidos[nome] === linha.id)!,
        [linha.data_solicitacao, linha.data_compra, linha.evento_volta_id],
      ]),
    );
    expect(datas).toEqual({
      pedido: ["2026-10-01", null, null],
      emitido: ["2026-09-10", "2026-09-18", null],
      alterado: ["2026-09-01", "2026-09-05", null],
      // A compra nunca fica antes da solicitação.
      invertido: ["2026-08-20", "2026-08-20", null],
      hospedagem: ["2026-09-12", "2026-09-12", null],
    });
  });

  it("depois da 0019: pedido novo nasce com a data de hoje; a compra não vem antes do pedido; a turnê só no voo e com outra palestra", async () => {
    const { data_solicitacao: hoje, data_compra: semCompra } = await um(
      `insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning data_solicitacao::text, data_compra::text`,
      [eventoId, pessoaId],
    );
    expect(hoje).toBe(((await um(`select (now() at time zone 'America/Sao_Paulo')::date::text as hoje`)).hoje));
    expect(semCompra).toBeNull();
    await expect(banco.sql(`update eventos.pedido_sdc set data_compra = '2026-09-09' where id = $1`, [pedidos.emitido])).rejects.toThrow(/pedido_sdc_data_compra_check/);
    await banco.sql(`update eventos.pedido_sdc set data_compra = '2026-09-10' where id = $1`, [pedidos.emitido]);

    await banco.sql(`update eventos.pedido_sdc set evento_volta_id = $2 where id = $1`, [pedidos.pedido, outroEventoId]);
    await expect(banco.sql(`update eventos.pedido_sdc set evento_volta_id = $2 where id = $1`, [pedidos.pedido, eventoId])).rejects.toThrow(/pedido_sdc_evento_volta_check/);
    await expect(banco.sql(`update eventos.pedido_sdc set evento_volta_id = $2 where id = $1`, [pedidos.hospedagem, outroEventoId])).rejects.toThrow(/pedido_sdc_evento_volta_check/);
    // O evento da última palestra não some enquanto houver pedido de turnê apontando para ele.
    await expect(banco.sql(`delete from eventos.evento where id = $1`, [outroEventoId])).rejects.toThrow(/pedido_sdc_evento_volta_id_evento_id_fk/);
  });

  it("o papel do app grava as colunas novas (o privilégio é da tabela inteira); o de leitura não", async () => {
    expect(
      await banco.comoPapel("app_eventos", `update eventos.pedido_sdc set data_solicitacao = '2026-09-30', evento_volta_id = null where id = $1 returning data_solicitacao::text`, [pedidos.pedido]),
    ).toEqual([{ data_solicitacao: "2026-09-30" }]);
    await expect(banco.comoPapel("app_eventos_leitura", `update eventos.pedido_sdc set data_compra = null where id = $1`, [pedidos.emitido])).rejects.toThrow(/permission denied/);
    expect(await banco.comoPapel("app_eventos_leitura", `select data_solicitacao::text from eventos.pedido_sdc where id = $1`, [pedidos.alterado])).toEqual([{ data_solicitacao: "2026-09-01" }]);
  });

  it("o down tira só o que a 0019 pôs: os pedidos e os instantes de lançamento ficam como estavam", async () => {
    const antes = await banco.sql(`select id, situacao, solicitado_em, emitido_em, valor_centavos from eventos.pedido_sdc order by id`);
    await descer();
    expect(await colunasNovas()).toEqual([]);
    expect(await banco.sql(`select id, situacao, solicitado_em, emitido_em, valor_centavos from eventos.pedido_sdc order by id`)).toEqual(antes);
    await subir();
    expect(await colunasNovas()).toHaveLength(3);
  });
});
