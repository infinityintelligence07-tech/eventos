import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0017_hotel-sem-escala";

// A 0017 roda sobre quartos que já têm gente. O banco de teste nasce com ela aplicada, então o teste volta com o
// .down.sql, grava ocupantes como eram antes (por convocação) e aplica de novo. Cada arquivo vai numa chamada só: o
// Postgres roda o lote numa transação implícita e desfaz tudo se um comando falha.
describe.skipIf(!TEST_DATABASE_URL)("migration 0017 (hotel sem escala) sobre dados existentes", () => {
  let banco: BancoDeTeste;
  let eventoId: string;
  let escalaId: string;
  let quarto1: string;
  let quarto2: string;
  let pedidoDeVooId: string;
  const pessoas: Record<string, { pessoaId: string; convocacaoId: string }> = {};

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const subir = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  const descer = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8"));
  const colunas = async () =>
    ((await banco.sql(`select column_name, is_nullable from information_schema.columns where table_schema = 'eventos' and table_name = 'quarto_ocupante' order by column_name`)) as { column_name: string; is_nullable: string }[]).map(
      (coluna) => `${coluna.column_name}${coluna.is_nullable === "YES" ? "?" : ""}`,
    );
  const NEGADO = /permission denied/;

  async function convocada(nome: string, { status = "ACEITA", precisaHotel = true, principal = true }: { status?: string; precisaHotel?: boolean; principal?: boolean } = {}) {
    const { id: pessoaId } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    const { id: convocacaoId } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, precisa_hotel, principal) values ($1, $2, $3, $4, $5) returning id`, [escalaId, pessoaId, status, precisaHotel, principal]);
    pessoas[nome] = { pessoaId: pessoaId as string, convocacaoId: convocacaoId as string };
    return pessoas[nome]!;
  }

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    eventoId = (await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now() + interval '10 days', now() + interval '12 days', 'PLANEJADO') returning id`)).id as string;
    escalaId = (await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, current_date + 10, '08:00', '18:00', 20, 'ABERTA') returning id`, [eventoId])).id as string;
    const { id: hospedagemId } = await um(`insert into eventos.hospedagem (evento_id, check_in, check_out) values ($1, current_date + 9, current_date + 12) returning id`, [eventoId]);
    quarto1 = (await um(`insert into eventos.quarto (hospedagem_id, nome, capacidade) values ($1, 'Quarto 1', 3) returning id`, [hospedagemId])).id as string;
    quarto2 = (await um(`insert into eventos.quarto (hospedagem_id, nome, capacidade) values ($1, 'Quarto 2', 3) returning id`, [hospedagemId])).id as string;

    // Como era antes: o ocupante é a convocação.
    const marcada = await convocada("Marcada Na Escala");
    const comPeriodo = await convocada("Com Período Próprio");
    // Saiu da escala já avisada (CANCELADA) e ficou no quarto; e alguém que perdeu a marca de hotel por fora da tela.
    const cancelada = await convocada("Cancelada No Quarto", { status: "CANCELADA" });
    const semMarca = await convocada("Sem Marca No Quarto", { precisaHotel: false });
    await convocada("Sem Quarto");
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, convocacao_id) values ($1, $2), ($1, $3)`, [quarto1, marcada.convocacaoId, cancelada.convocacaoId]);
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, convocacao_id, check_in, check_out) values ($1, $2, current_date + 10, current_date + 11)`, [quarto2, comPeriodo.convocacaoId]);
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, convocacao_id) values ($1, $2)`, [quarto2, semMarca.convocacaoId]);
    pedidoDeVooId = (await um(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning id`, [eventoId, marcada.pessoaId])).id as string;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0017: o ocupante é a convocação (obrigatória) e não existem a lista avulsa nem a marca no voo", async () => {
    expect(await colunas()).toEqual(["check_in?", "check_out?", "convocacao_id", "criado_em", "quarto_id"]);
    expect(await um(`select to_regclass('eventos.hospedagem_pessoa') is null as falta`)).toEqual({ falta: true });
    await expect(banco.sql(`select precisa_hotel from eventos.pedido_sdc`)).rejects.toThrow(/precisa_hotel/);
  });

  it("aplica sem perder nada: cada pessoa continua no mesmo quarto, com o mesmo período, agora como pessoa no evento", async () => {
    const antes = await banco.sql(`select o.quarto_id, o.convocacao_id, o.check_in::text, o.check_out::text, o.criado_em from eventos.quarto_ocupante o order by o.convocacao_id`);
    await subir();

    expect(await colunas()).toEqual(["check_in?", "check_out?", "convocacao_id?", "criado_em", "evento_id", "pessoa_id", "quarto_id"]);
    expect(await banco.sql(`select o.quarto_id, o.convocacao_id, o.check_in::text, o.check_out::text, o.criado_em from eventos.quarto_ocupante o order by o.convocacao_id`)).toEqual(antes);
    expect(
      await banco.sql(
        `select p.nome_completo as nome, o.quarto_id, o.evento_id, o.convocacao_id from eventos.quarto_ocupante o join core.pessoa p on p.id = o.pessoa_id order by p.nome_completo`,
      ),
    ).toEqual(
      [
        ["Cancelada No Quarto", quarto1],
        ["Com Período Próprio", quarto2],
        ["Marcada Na Escala", quarto1],
        ["Sem Marca No Quarto", quarto2],
      ].map(([nome, quarto]) => ({ nome, quarto_id: quarto, evento_id: eventoId, convocacao_id: pessoas[nome!]!.convocacaoId })),
    );

    // Quem estava num quarto sem estar marcado por uma convocação principal ativa fica como "acrescentada na
    // Hospedagem", para continuar no quarto com uma origem. Quem já estava marcada na escala não ganha linha.
    expect(await banco.sql(`select p.nome_completo as nome, hp.criado_por from eventos.hospedagem_pessoa hp join core.pessoa p on p.id = hp.pessoa_id where hp.evento_id = $1 order by 1`, [eventoId])).toEqual([
      { nome: "Cancelada No Quarto", criado_por: null },
      { nome: "Sem Marca No Quarto", criado_por: null },
    ]);
    // Os pedidos de voo que já existiam ficam sem a marca de hotel.
    expect(await um(`select precisa_hotel from eventos.pedido_sdc where id = $1`, [pedidoDeVooId])).toEqual({ precisa_hotel: false });
  });

  it("depois da 0017: ocupante sem convocação, uma cama por pessoa no evento, e sair da escala não tira do quarto", async () => {
    const { id: semEscala } = await um(`insert into core.pessoa (nome_completo) values ('Sem Escala') returning id`);
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, evento_id, pessoa_id) values ($1, $2, $3)`, [quarto1, eventoId, semEscala]);
    await expect(banco.sql(`insert into eventos.quarto_ocupante (quarto_id, evento_id, pessoa_id) values ($1, $2, $3)`, [quarto2, eventoId, semEscala])).rejects.toThrow(/quarto_ocupante_evento_pessoa_unique/);
    await expect(banco.sql(`insert into eventos.quarto_ocupante (quarto_id, evento_id) values ($1, $2)`, [quarto2, eventoId])).rejects.toThrow(/null value in column "pessoa_id"/);
    await banco.sql(`delete from eventos.quarto_ocupante where pessoa_id = $1`, [semEscala]);

    // Apagar a convocação (a pessoa saiu da escala sem ter sido avisada) só esvazia o vínculo.
    const marcada = pessoas["Marcada Na Escala"]!;
    await banco.sql(`update eventos.pedido_sdc set convocacao_id = null where pessoa_id = $1`, [marcada.pessoaId]);
    await banco.sql(`delete from eventos.convocacao where id = $1`, [marcada.convocacaoId]);
    expect(await banco.sql(`select quarto_id, convocacao_id from eventos.quarto_ocupante where pessoa_id = $1`, [marcada.pessoaId])).toEqual([{ quarto_id: quarto1, convocacao_id: null }]);
  });

  it("privilégios: o app inclui e tira gente da lista avulsa e grava as colunas novas; as páginas só leem; worker e cópia não enxergam", async () => {
    expect(await um(`select relrowsecurity from pg_class where oid = 'eventos.hospedagem_pessoa'::regclass`)).toEqual({ relrowsecurity: true });
    const semQuarto = pessoas["Sem Quarto"]!;
    const par = [eventoId, semQuarto.pessoaId];
    expect(await banco.comoPapel("app_eventos", `insert into eventos.hospedagem_pessoa (evento_id, pessoa_id) values ($1, $2) returning pessoa_id`, par)).toEqual([{ pessoa_id: semQuarto.pessoaId }]);
    await banco.sql(`insert into eventos.hospedagem_pessoa (evento_id, pessoa_id) values ($1, $2)`, par);
    expect(await banco.comoPapel("app_eventos", `delete from eventos.hospedagem_pessoa where evento_id = $1 and pessoa_id = $2 returning pessoa_id`, par)).toHaveLength(1);
    await expect(banco.comoPapel("app_eventos", `update eventos.hospedagem_pessoa set criado_em = now() where evento_id = $1`, [eventoId])).rejects.toThrow(NEGADO);
    expect(await banco.comoPapel("app_eventos_leitura", `select count(*)::int as n from eventos.hospedagem_pessoa where evento_id = $1`, [eventoId])).toEqual([{ n: 3 }]);
    await expect(banco.comoPapel("app_eventos_leitura", `delete from eventos.hospedagem_pessoa where evento_id = $1`, [eventoId])).rejects.toThrow(NEGADO);
    for (const papel of ["app_eventos_copia", "app_eventos_worker"] as const) {
      await expect(banco.comoPapel(papel, `select 1 from eventos.hospedagem_pessoa`), papel).rejects.toThrow(NEGADO);
    }
    expect(
      await banco.comoPapel("app_eventos", `insert into eventos.quarto_ocupante (quarto_id, evento_id, pessoa_id) values ($1, $2, $3) returning convocacao_id`, [quarto1, eventoId, semQuarto.pessoaId]),
    ).toEqual([{ convocacao_id: null }]);
    expect(await banco.comoPapel("app_eventos", `update eventos.pedido_sdc set precisa_hotel = true where id = $1 returning precisa_hotel`, [pedidoDeVooId])).toEqual([{ precisa_hotel: true }]);
    await expect(banco.comoPapel("app_eventos_leitura", `update eventos.pedido_sdc set precisa_hotel = true where id = $1`, [pedidoDeVooId])).rejects.toThrow(NEGADO);
  });

  it("o down não tira ninguém do quarto: com ocupante sem convocação ele para; sem isso, volta ao modelo antigo", async () => {
    await expect(descer()).rejects.toThrow(/ocupante\(s\) de quarto sem convocação/);
    expect((await colunas()).includes("pessoa_id")).toBe(true);
    await banco.sql(`delete from eventos.quarto_ocupante where convocacao_id is null`);
    await descer();
    expect(await colunas()).toEqual(["check_in?", "check_out?", "convocacao_id", "criado_em", "quarto_id"]);
    expect(await um(`select count(*)::int as n from eventos.quarto_ocupante`)).toEqual({ n: 3 });
  });

  it("a mesma pessoa em dois quartos do evento (por duas convocações): a 0017 para com mensagem clara, sem aplicar nada", async () => {
    const { pessoaId, convocacaoId } = pessoas["Com Período Próprio"]!;
    const { id: outraLinha } = await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, current_date + 11, '08:00', '18:00', 2, 'ABERTA') returning id`, [eventoId]);
    const { id: segunda } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, principal) values ($1, $2, 'ACEITA', false) returning id`, [outraLinha, pessoaId]);
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, convocacao_id) values ($1, $2)`, [quarto1, segunda]);
    await expect(subir()).rejects.toThrow(/0017: 1 pessoa\(s\) em mais de um quarto no mesmo evento/);
    expect(await colunas()).toEqual(["check_in?", "check_out?", "convocacao_id", "criado_em", "quarto_id"]);
    await banco.sql(`delete from eventos.quarto_ocupante where convocacao_id = $1`, [segunda]);
    await subir();
    expect(await banco.sql(`select quarto_id from eventos.quarto_ocupante where pessoa_id = $1`, [pessoaId])).toEqual([{ quarto_id: quarto2 }]);
    expect(convocacaoId).toBeTruthy();
  });
});
