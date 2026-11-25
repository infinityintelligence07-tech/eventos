import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0018_locais-do-iam-control";

// A 0018 roda sobre os locais que a produção já tem. O banco de teste nasce com ela aplicada, então o teste volta com
// o .down.sql, grava locais e eventos como eram antes (sem origem) e aplica de novo.
describe.skipIf(!TEST_DATABASE_URL)("migration 0018 (locais do IAM Control) sobre dados existentes", () => {
  let banco: BancoDeTeste;

  const subir = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  const descer = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8"));
  const colunas = async () =>
    ((await banco.sql(`select column_name from information_schema.columns where table_schema = 'eventos' and table_name = 'local' order by column_name`)) as { column_name: string }[]).map((coluna) => coluna.column_name);
  const locais = () => banco.sql(`select nome, tipo, cidade, logradouro, lat, capacidade, atualizado_em::text as atualizado_em, deleted_at is not null as arquivado from eventos.local order by nome, tipo`);
  const NEGADO = /permission denied/;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    const local = async (nome: string, tipo: string, extras = "") =>
      ((await banco.sql(`insert into eventos.local (nome, tipo, cidade, uf, logradouro, lat, lng, capacidade, atualizado_em ${extras ? ", deleted_at" : ""}) values ($1, $2, 'Manaus', 'AM', 'Av. Um', -3.1, -60.0, 200, '2026-10-01T12:00:00Z' ${extras}) returning id`, [nome, tipo])) as { id: string }[])[0]!.id;
    const evento = (nome: string, localId: string | null, turmaId: number | null, extras = "") =>
      banco.sql(`insert into eventos.evento (nome, inicio, fim, status, local_id, iam_control_turma_id ${extras ? ", deleted_at" : ""}) values ($1, now(), now(), 'PLANEJADO', $2, $3 ${extras})`, [nome, localId, turmaId]);

    // Posto pela sincronização num evento de turma (o caso comum), inclusive o "Local a definir".
    await evento("Evento de turma", await local("Centro de Convenções", "EVENTO"), 501);
    await evento("Evento sem local cadastrado", await local("Local a definir — Manaus", "EVENTO"), 502);
    // O time trocou o tipo para hotel depois; o evento de turma continua apontando para ele.
    await evento("Evento em hotel", await local("Hotel Do Evento", "HOTEL"), 503);
    // Evento de turma apagado no Eventos e local arquivado: a origem é um fato, vale do mesmo jeito.
    await evento("Evento apagado", await local("Salão Antigo", "EVENTO", ", now()"), 504, ", now()");
    // Cadastros do time: hotel e apartamento da hospedagem, local de evento que nenhuma turma usa e local de um
    // evento criado à mão (sem turma).
    await local("Hotel Da Hospedagem", "HOTEL");
    await local("Apartamento IAM", "APARTAMENTO");
    await local("Espaço Sem Turma", "EVENTO");
    await evento("Evento sem turma", await local("Espaço Do Evento Manual", "EVENTO"), null);
    // Apartamento apontado por evento de turma (não deveria existir, mas a produção tem dados): continua do Eventos.
    await evento("Evento em apartamento", await local("Apartamento Estranho", "APARTAMENTO"), 505);
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0018 o local não tem origem", async () => {
    expect(await colunas()).not.toContain("origem");
    expect(await colunas()).not.toContain("iam_control_endereco_id");
  });

  it("aplica sem mexer em nome, tipo, endereço nem na versão das linhas, e marca a origem pelo evento de turma", async () => {
    const antes = await locais();
    await subir();

    expect(await colunas()).toEqual(expect.arrayContaining(["origem", "iam_control_endereco_id"]));
    expect(await locais()).toEqual(antes);
    expect(await banco.sql(`select nome, origem, iam_control_endereco_id from eventos.local order by nome`)).toEqual(
      [
        ["Apartamento Estranho", "EVENTOS"],
        ["Apartamento IAM", "EVENTOS"],
        ["Centro de Convenções", "IAM_CONTROL"],
        ["Espaço Do Evento Manual", "EVENTOS"],
        ["Espaço Sem Turma", "EVENTOS"],
        ["Hotel Da Hospedagem", "EVENTOS"],
        ["Hotel Do Evento", "IAM_CONTROL"],
        ["Local a definir — Manaus", "IAM_CONTROL"],
        ["Salão Antigo", "IAM_CONTROL"],
      ].map(([nome, origem]) => ({ nome, origem, iam_control_endereco_id: null })),
    );
  });

  it("o banco recusa origem desconhecida e id do IAM Control em cadastro do Eventos; cadastro novo nasce do Eventos", async () => {
    await expect(banco.sql(`update eventos.local set origem = 'PLANILHA' where nome = 'Hotel Da Hospedagem'`)).rejects.toThrow(/local_origem_check/);
    await expect(banco.sql(`update eventos.local set iam_control_endereco_id = 7 where nome = 'Hotel Da Hospedagem'`)).rejects.toThrow(/local_iam_control_endereco_check/);
    expect(await banco.sql(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel Novo', 'HOTEL', 'Manaus', 'AM') returning origem, iam_control_endereco_id`)).toEqual([{ origem: "EVENTOS", iam_control_endereco_id: null }]);
  });

  it("privilégios: a sincronização grava a origem; o app cadastra e edita o que é dele, sem mudar a origem", async () => {
    await banco.comoPapel("app_eventos_worker", `insert into eventos.local (nome, tipo, cidade, uf, origem, iam_control_endereco_id) values ('Do IAM Control', 'EVENTO', 'Manaus', 'AM', 'IAM_CONTROL', 12)`);
    await banco.comoPapel("app_eventos_worker", `update eventos.local set origem = 'IAM_CONTROL', iam_control_endereco_id = 12 where nome = 'Hotel Da Hospedagem'`);
    await banco.comoPapel("app_eventos", `insert into eventos.local (nome, tipo, cidade, uf) values ('Cadastro Do Time', 'HOTEL', 'Manaus', 'AM')`);
    await banco.comoPapel("app_eventos", `update eventos.local set tipo = 'HOTEL', complemento = 'Bloco A', capacidade = 10 where nome = 'Centro de Convenções'`);
    await expect(banco.comoPapel("app_eventos", `update eventos.local set origem = 'EVENTOS' where nome = 'Centro de Convenções'`)).rejects.toThrow(NEGADO);
    await expect(banco.comoPapel("app_eventos", `update eventos.local set iam_control_endereco_id = 1 where nome = 'Centro de Convenções'`)).rejects.toThrow(NEGADO);
    expect(await banco.comoPapel("app_eventos_leitura", `select origem from eventos.local where nome = 'Centro de Convenções'`)).toEqual([{ origem: "IAM_CONTROL" }]);
    expect(await banco.comoPapel("app_eventos_copia", `select origem, iam_control_endereco_id from eventos.local where nome = 'Centro de Convenções'`)).toEqual([{ origem: "IAM_CONTROL", iam_control_endereco_id: null }]);
  });

  it("o down devolve a tabela como era, sem apagar local nenhum, e a 0018 aplica de novo", async () => {
    const antes = await locais();
    await descer();
    expect(await colunas()).not.toContain("origem");
    expect(await locais()).toEqual(antes);
    await subir();
    expect(await banco.sql(`select count(*)::int as n from eventos.local where origem = 'IAM_CONTROL'`)).toEqual([{ n: 4 }]);
  });
});
