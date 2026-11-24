import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0015_voos-e-hotel-pela-sdc";

// A 0015 roda sobre dados que já existem (pedidos de voo, hospedagens com hotel, eventos). O banco de teste nasce com
// ela aplicada, então o teste volta com o .down.sql, grava dados como eram antes e aplica de novo. Cada arquivo vai
// numa chamada só: o Postgres roda o lote numa transação implícita e desfaz tudo se um comando falha.
describe.skipIf(!TEST_DATABASE_URL)("migration 0015 sobre dados existentes", () => {
  let banco: BancoDeTeste;
  let eventoId: string;
  let pessoaId: string;
  let hotelId: string;
  let hospedagemId: string;
  let pedidoDeVooId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const subir = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  const descer = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8"));
  const colunasNovas = () =>
    banco.sql(
      `select table_name || '.' || column_name as coluna from information_schema.columns
        where table_schema = 'eventos' and (table_name, column_name) in (('evento', 'sem_voo'), ('evento', 'sem_hospedagem'), ('pedido_sdc', 'forma_pagamento'))
        order by 1`,
    );
  const novoVoo = () => banco.sql(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning id`, [eventoId, pessoaId]);
  const hospedagemSemHotel = () =>
    banco.sql(`insert into eventos.hospedagem (evento_id, check_in, check_out) values ($1, current_date + 9, current_date + 12) returning id`, [eventoId]);

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    eventoId = (
      await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now() + interval '10 days', now() + interval '12 days', 'PLANEJADO') returning id`)
    ).id as string;
    pessoaId = (await um(`insert into core.pessoa (nome_completo) values ('Pessoa de teste') returning id`)).id as string;
    hotelId = (await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel de teste', 'HOTEL', 'Manaus', 'AM') returning id`)).id as string;
    pedidoDeVooId = (await um(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning id`, [eventoId, pessoaId])).id as string;
    const pedidoDeHotel = (await um(`insert into eventos.pedido_sdc (tipo, evento_id) values ('HOSPEDAGEM', $1) returning id`, [eventoId])).id as string;
    hospedagemId = (
      await um(`insert into eventos.hospedagem (evento_id, local_id, pedido_id, check_in, check_out, numero_reserva) values ($1, $2, $3, current_date + 9, current_date + 12, 'RES-1') returning id`, [
        eventoId,
        hotelId,
        pedidoDeHotel,
      ])
    ).id as string;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0015: um voo ativo por pessoa no evento, hospedagem só com hotel e sem as colunas novas", async () => {
    expect(await colunasNovas()).toEqual([]);
    await expect(novoVoo()).rejects.toThrow(/pedido_sdc_voo_ativo_unique/);
    await expect(hospedagemSemHotel()).rejects.toThrow(/null value in column "local_id"/);
  });

  it("aplica sem mexer no que já existe: pedidos, hospedagem com hotel e eventos continuam como estavam", async () => {
    await subir();

    expect(await colunasNovas()).toEqual([{ coluna: "evento.sem_hospedagem" }, { coluna: "evento.sem_voo" }, { coluna: "pedido_sdc.forma_pagamento" }]);
    expect(await um(`select sem_voo, sem_hospedagem from eventos.evento where id = $1`, [eventoId])).toEqual({ sem_voo: false, sem_hospedagem: false });
    expect(await um(`select local_id, numero_reserva from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ local_id: hotelId, numero_reserva: "RES-1" });
    expect(await banco.sql(`select tipo, situacao, forma_pagamento from eventos.pedido_sdc where evento_id = $1 order by tipo`, [eventoId])).toEqual([
      { tipo: "HOSPEDAGEM", situacao: "PEDIDO", forma_pagamento: null },
      { tipo: "VOO", situacao: "PEDIDO", forma_pagamento: null },
    ]);
  });

  it("depois da 0015: mais de um voo ativo por pessoa no evento, hospedagem sem hotel e forma de pagamento", async () => {
    await expect(novoVoo()).resolves.toHaveLength(1);
    await expect(hospedagemSemHotel()).resolves.toHaveLength(1);
    await banco.sql(`update eventos.pedido_sdc set forma_pagamento = 'Faturado SDC' where id = $1`, [pedidoDeVooId]);
    await expect(banco.sql(`update eventos.pedido_sdc set forma_pagamento = '' where id = $1`, [pedidoDeVooId])).rejects.toThrow(/pedido_sdc_forma_pagamento_check/);
    // O passageiro continua obrigatório no voo.
    await expect(banco.sql(`insert into eventos.pedido_sdc (tipo, evento_id) values ('VOO', $1)`, [eventoId])).rejects.toThrow(/pedido_sdc_passageiro_check/);
  });

  it("o papel do app marca e desfaz os marcadores do evento e apaga hospedagem; o resto do evento continua fora do alcance dele", async () => {
    expect(await banco.comoPapel("app_eventos", `update eventos.evento set sem_voo = true, sem_hospedagem = true where id = $1 returning sem_voo, sem_hospedagem`, [eventoId])).toEqual([
      { sem_voo: true, sem_hospedagem: true },
    ]);
    await expect(banco.comoPapel("app_eventos", `update eventos.evento set nome = 'Outro nome' where id = $1`, [eventoId])).rejects.toThrow(/permission denied/);
    await expect(banco.comoPapel("app_eventos_leitura", `update eventos.evento set sem_voo = true where id = $1`, [eventoId])).rejects.toThrow(/permission denied/);
    expect(await banco.comoPapel("app_eventos", `delete from eventos.hospedagem where evento_id = $1 and local_id is null returning id`, [eventoId])).toHaveLength(1);
    expect(await banco.comoPapel("app_eventos_leitura", `select sem_voo from eventos.evento where id = $1`, [eventoId])).toEqual([{ sem_voo: false }]);
  });

  it("o .down.sql não apaga dado do time: para enquanto houver hospedagem sem hotel ou pedido de voo a mais", async () => {
    await expect(descer()).rejects.toThrow(/down da 0015: há hospedagem sem hotel definido/);
    await banco.sql(`delete from eventos.hospedagem where local_id is null`);
    await expect(descer()).rejects.toThrow(/down da 0015: há pessoa com mais de um pedido de voo ativo/);
    // Nada mudou com as tentativas (o lote inteiro foi desfeito).
    expect(await colunasNovas()).toHaveLength(3);

    await banco.sql(`delete from eventos.pedido_sdc where tipo = 'VOO' and id <> $1`, [pedidoDeVooId]);
    await descer();
    expect(await colunasNovas()).toEqual([]);
    await expect(novoVoo()).rejects.toThrow(/pedido_sdc_voo_ativo_unique/);
    await expect(hospedagemSemHotel()).rejects.toThrow(/null value in column "local_id"/);
    await expect(banco.comoPapel("app_eventos", `delete from eventos.hospedagem where id = $1`, [hospedagemId])).rejects.toThrow(/permission denied/);

    // E a migration aplica de novo sobre o banco que voltou.
    await subir();
    expect(await colunasNovas()).toHaveLength(3);
    expect(await um(`select local_id from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ local_id: hotelId });
  });
});
