import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0020_voo-sem-aeroporto";

// A 0020 roda sobre trechos que já existem (todos com os dois aeroportos). O banco de teste nasce com ela aplicada,
// então o teste volta com o .down.sql, grava trechos como eram antes e aplica de novo. Cada arquivo vai numa chamada
// só: o Postgres roda o lote numa transação implícita e desfaz tudo se um comando falha.
describe.skipIf(!TEST_DATABASE_URL)("migration 0020 (pedido de voo sem aeroporto) sobre dados existentes", () => {
  let banco: BancoDeTeste;
  let pedidoId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const subir = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  const descer = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8"));
  const colunas = async () =>
    Object.fromEntries(
      ((await banco.sql(
        `select column_name, is_nullable from information_schema.columns where table_schema = 'eventos' and table_name = 'trecho_voo' and column_name in ('origem_cidade', 'destino_cidade', 'origem_iata', 'destino_iata') order by 1`,
      )) as { column_name: string; is_nullable: string }[]).map((linha) => [linha.column_name, linha.is_nullable]),
    );
  const checks = async () =>
    ((await banco.sql(`select conname from pg_constraint where conrelid = 'eventos.trecho_voo'::regclass and contype = 'c' and conname in ('trecho_voo_iata_check', 'trecho_voo_pontas_check', 'trecho_voo_cidade_check') order by 1`)) as { conname: string }[]).map(
      (linha) => linha.conname,
    );
  const antigas = `id, pedido_id, sentido, origem_iata, destino_iata, data_desejada, preferencia_horario, companhia, numero_voo, localizador, partida_em, chegada_em, cartao_embarque_url, criado_em, atualizado_em`;
  const novoTrecho = (sentido: string, colunasDoTrecho: string, valores: string) =>
    banco.sql(`insert into eventos.trecho_voo (pedido_id, sentido, data_desejada, ${colunasDoTrecho}) values ($1, $2, '2026-12-14', ${valores})`, [pedidoId, sentido]);

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    const eventoId = (await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now() + interval '10 days', now() + interval '12 days', 'PLANEJADO') returning id`)).id as string;
    const pessoaId = (await um(`insert into core.pessoa (nome_completo) values ('Pessoa de teste') returning id`)).id as string;
    pedidoId = (await um(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id, situacao, valor_centavos, emitido_em) values ('VOO', $1, $2, 'EMITIDO', 98000, now()) returning id`, [eventoId, pessoaId])).id as string;
    // Como o código anterior grava: sempre os dois aeroportos; a ida já emitida, a volta ainda só pedida.
    await banco.sql(
      `insert into eventos.trecho_voo (pedido_id, sentido, origem_iata, destino_iata, data_desejada, preferencia_horario, companhia, numero_voo, localizador, partida_em, chegada_em)
       values ($1, 'IDA', 'POA', 'MAO', '2026-12-14', 'MANHA', 'Azul', 'AD4120', 'KXQ7PZ', '2026-12-14T11:10:00Z', '2026-12-14T14:45:00Z')`,
      [pedidoId],
    );
    await banco.sql(`insert into eventos.trecho_voo (pedido_id, sentido, origem_iata, destino_iata, data_desejada) values ($1, 'VOLTA', 'MAO', 'POA', '2026-12-17')`, [pedidoId]);
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0020: os dois aeroportos são obrigatórios e não há cidade", async () => {
    expect(await colunas()).toEqual({ destino_iata: "NO", origem_iata: "NO" });
    expect(await checks()).toEqual(["trecho_voo_iata_check"]);
  });

  it("aplica sem mexer em nenhum trecho: os que existem ficam com o aeroporto que têm e sem cidade", async () => {
    const antes = await banco.sql(`select ${antigas} from eventos.trecho_voo order by sentido`);
    await subir();
    expect(await colunas()).toEqual({ destino_cidade: "YES", destino_iata: "YES", origem_cidade: "YES", origem_iata: "YES" });
    expect(await checks()).toEqual(["trecho_voo_cidade_check", "trecho_voo_iata_check", "trecho_voo_pontas_check"]);
    expect(await banco.sql(`select ${antigas} from eventos.trecho_voo order by sentido`)).toEqual(antes);
    expect(await banco.sql(`select sentido, origem_cidade, destino_cidade, origem_iata, destino_iata from eventos.trecho_voo order by sentido`)).toEqual([
      { sentido: "IDA", origem_cidade: null, destino_cidade: null, origem_iata: "POA", destino_iata: "MAO" },
      { sentido: "VOLTA", origem_cidade: null, destino_cidade: null, origem_iata: "MAO", destino_iata: "POA" },
    ]);
  });

  it("depois da 0020: o trecho nasce só com as cidades; o código anterior, que grava só os aeroportos, continua passando", async () => {
    await banco.sql(`delete from eventos.trecho_voo where pedido_id = $1`, [pedidoId]);
    // Código novo: cidades, sem aeroporto. Código anterior (até o deploy terminar): aeroportos, sem cidade.
    await novoTrecho("IDA", "origem_cidade, destino_cidade", "'Porto Alegre (RS)', 'Manaus (AM)'");
    await novoTrecho("VOLTA", "origem_iata, destino_iata", "'MAO', 'POA'");
    // A SDC informa o aeroporto depois: um só, ou os dois.
    await banco.sql(`update eventos.trecho_voo set destino_iata = 'MAO' where pedido_id = $1 and sentido = 'IDA'`, [pedidoId]);
    await banco.sql(`update eventos.trecho_voo set origem_iata = 'POA' where pedido_id = $1 and sentido = 'IDA'`, [pedidoId]);
    await banco.sql(`delete from eventos.trecho_voo where pedido_id = $1`, [pedidoId]);
  });

  it("CHECKs: cada ponta tem cidade ou aeroporto; aeroporto, quando vem, são 3 letras e diferentes; cidade de 2 a 80 caracteres", async () => {
    const recusa = async (colunasDoTrecho: string, valores: string, check: RegExp) => expect(novoTrecho("IDA", colunasDoTrecho, valores), `${colunasDoTrecho} = ${valores}`).rejects.toThrow(check);
    // Sem nada numa das pontas (ou nas duas).
    await expect(banco.sql(`insert into eventos.trecho_voo (pedido_id, sentido, data_desejada) values ($1, 'IDA', '2026-12-14')`, [pedidoId])).rejects.toThrow(/trecho_voo_pontas_check/);
    await recusa("origem_cidade", "'Porto Alegre (RS)'", /trecho_voo_pontas_check/);
    await recusa("destino_iata", "'MAO'", /trecho_voo_pontas_check/);
    await recusa("origem_cidade, origem_iata", "'Porto Alegre (RS)', 'POA'", /trecho_voo_pontas_check/);
    // Aeroporto fora do formato ou repetido.
    await recusa("origem_cidade, destino_cidade, origem_iata", "'Porto Alegre (RS)', 'Manaus (AM)', 'poa'", /trecho_voo_iata_check/);
    await recusa("origem_cidade, destino_cidade, destino_iata", "'Porto Alegre (RS)', 'Manaus (AM)', 'MANAUS'", /trecho_voo_iata_check/);
    await recusa("origem_cidade, destino_cidade, origem_iata, destino_iata", "'Porto Alegre (RS)', 'Manaus (AM)', 'POA', 'POA'", /trecho_voo_iata_check/);
    await recusa("origem_iata, destino_iata", "'POA', 'POA'", /trecho_voo_iata_check/);
    // Cidade curta ou longa demais.
    await recusa("origem_cidade, destino_cidade", "'P', 'Manaus (AM)'", /trecho_voo_cidade_check/);
    await recusa("origem_cidade, destino_cidade", `'Porto Alegre (RS)', '${"x".repeat(81)}'`, /trecho_voo_cidade_check/);
    // Um aeroporto numa ponta e a cidade na outra vale (a SDC informou só um).
    await novoTrecho("IDA", "origem_iata, destino_cidade", "'POA', 'Manaus (AM)'");
    await banco.sql(`delete from eventos.trecho_voo where pedido_id = $1`, [pedidoId]);
  });

  it("o papel do app grava as colunas novas (o privilégio é da tabela inteira); o de leitura só lê", async () => {
    await novoTrecho("IDA", "origem_iata, destino_iata", "'POA', 'MAO'");
    expect(
      await banco.comoPapel("app_eventos", `update eventos.trecho_voo set origem_cidade = 'Porto Alegre (RS)', destino_cidade = 'Manaus (AM)', origem_iata = null where pedido_id = $1 returning origem_cidade, origem_iata`, [pedidoId]),
    ).toEqual([{ origem_cidade: "Porto Alegre (RS)", origem_iata: null }]);
    expect(await banco.comoPapel("app_eventos_leitura", `select origem_iata, destino_iata, origem_cidade, destino_cidade from eventos.trecho_voo where pedido_id = $1`, [pedidoId])).toEqual([
      { origem_iata: "POA", destino_iata: "MAO", origem_cidade: null, destino_cidade: null },
    ]);
    await expect(banco.comoPapel("app_eventos_leitura", `update eventos.trecho_voo set origem_cidade = 'Outra' where pedido_id = $1`, [pedidoId])).rejects.toThrow(/permission denied/);
  });

  it("o down não apaga trecho: para enquanto houver trecho sem aeroporto; sem eles, tira as cidades e volta ao modelo antigo", async () => {
    await novoTrecho("VOLTA", "origem_cidade, destino_cidade", "'Manaus (AM)', 'Porto Alegre (RS)'");
    await expect(descer()).rejects.toThrow(/down da 0020: 1 trecho\(s\) de voo sem aeroporto/);
    // Nada mudou: o lote do down é desfeito inteiro.
    expect(await colunas()).toEqual({ destino_cidade: "YES", destino_iata: "YES", origem_cidade: "YES", origem_iata: "YES" });

    await banco.sql(`update eventos.trecho_voo set origem_iata = 'MAO', destino_iata = 'POA' where pedido_id = $1 and sentido = 'VOLTA'`, [pedidoId]);
    const antes = await banco.sql(`select ${antigas} from eventos.trecho_voo order by sentido`);
    await descer();
    expect(await colunas()).toEqual({ destino_iata: "NO", origem_iata: "NO" });
    expect(await checks()).toEqual(["trecho_voo_iata_check"]);
    expect(await banco.sql(`select ${antigas} from eventos.trecho_voo order by sentido`)).toEqual(antes);
    await expect(banco.sql(`update eventos.trecho_voo set origem_iata = null where pedido_id = $1`, [pedidoId])).rejects.toThrow(/null value|not-null/);
    await subir();
    expect(await checks()).toHaveLength(3);
  });
});
