import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0013_escala-hotel-situacao-e-funcoes";

// A 0013 mexe em dados que já existem. O banco de teste nasce com ela aplicada, então o teste volta com o .down.sql,
// grava dados como eram antes e aplica a migration de novo, numa transação só (como o migrador do Drizzle faz).
describe.skipIf(!TEST_DATABASE_URL)("migration 0013 sobre dados existentes", () => {
  let banco: BancoDeTeste;
  let escalaId: string;
  let eventoId: string;
  let paiMaeId: string;
  let staffId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;
  const subir = () => banco.sql(`BEGIN;\n${readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", "")}\n;COMMIT;`);
  const descer = () => banco.sql(`BEGIN;\n${readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8")}\n;COMMIT;`);

  const convocacoes = async () =>
    Object.fromEntries(
      (
        (await banco.sql(
          `select p.nome_completo as nome, c.status, c.deslocamento, c.convidada_em is not null as avisada
             from eventos.convocacao c join core.pessoa p on p.id = c.pessoa_id where c.escala_id = $1`,
          [escalaId],
        )) as { nome: string; status: string; deslocamento: string | null; avisada: boolean }[]
      ).map(({ nome, ...resto }) => [nome, resto]),
    );

  async function pessoa(nome: string, convocacao: { status: string; deslocamento?: string; convidada?: boolean }) {
    const { id } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await banco.sql(`insert into eventos.pessoa_evento (pessoa_id) values ($1)`, [id]);
    const { id: convocacaoId } = await um(
      `insert into eventos.convocacao (escala_id, pessoa_id, status, deslocamento, convidada_em) values ($1, $2, $3, $4, $5) returning id`,
      [escalaId, id, convocacao.status, convocacao.deslocamento ?? null, convocacao.convidada ? "2026-11-01T12:00:00Z" : null],
    );
    return { pessoaId: id!, convocacaoId: convocacaoId! };
  }

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    paiMaeId = (await um(`select id from eventos.funcao where codigo = 'PAI_MAE'`)).id!;
    staffId = (await um(`select id from eventos.funcao where codigo = 'STAFF'`)).id!;
    eventoId = (
      await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Confronto de teste', now() + interval '10 days', now() + interval '12 days', 'PLANEJADO') returning id`)
    ).id!;
    escalaId = (
      await um(
        `insert into eventos.escala (evento_id, funcao_id, data, hora_inicio, hora_fim, quantidade_vagas, status)
         values ($1, $2, current_date + 10, '08:00', '18:00', 10, 'ABERTA') returning id`,
        [eventoId, paiMaeId],
      )
    ).id!;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0013 o banco aceita os valores antigos e não tem as colunas novas", async () => {
    const colunas = await banco.sql(
      `select column_name from information_schema.columns
        where table_schema = 'eventos' and (table_name, column_name) in (('convocacao', 'precisa_hotel'), ('funcao', 'cargo_do_evento'))`,
    );
    expect(colunas).toEqual([]);
    expect(await banco.sql(`select 1 from eventos.funcao where codigo = 'TRAINEE_LIDER'`)).toEqual([]);
  });

  it("aplica sobre linhas existentes: situação, deslocamento, hotel de quem já tem quarto e Pai / mãe", async () => {
    const sugerida = await pessoa("Sara Sugerida", { status: "SUGERIDA", deslocamento: "MOTO" });
    const convidada = await pessoa("Caio Convidado", { status: "CONVIDADA", deslocamento: "A_PE", convidada: true });
    const aceita = await pessoa("Ana Aceita", { status: "ACEITA", deslocamento: "NAO_SE_APLICA", convidada: true });
    await pessoa("Rui Recusou", { status: "RECUSADA", deslocamento: "CARRO_PROPRIO", convidada: true });
    await pessoa("Clara Cancelada", { status: "CANCELADA", deslocamento: "VOO", convidada: true });

    await banco.sql(`insert into eventos.pessoa_funcao (pessoa_id, funcao_id, nivel) values ($1, $2, 'HABILITADO'), ($1, $3, 'HABILITADO'), ($4, $2, 'TRAINEE')`, [
      sugerida.pessoaId,
      paiMaeId,
      staffId,
      convidada.pessoaId,
    ]);

    const { id: hotelId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel de teste', 'HOTEL', 'Manaus', 'AM') returning id`);
    const { id: hospedagemId } = await um(
      `insert into eventos.hospedagem (evento_id, local_id, check_in, check_out) values ($1, $2, current_date + 9, current_date + 12) returning id`,
      [eventoId, hotelId],
    );
    const { id: quartoId } = await um(`insert into eventos.quarto (hospedagem_id, nome, capacidade) values ($1, 'Quarto 1', 2) returning id`, [hospedagemId]);
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, convocacao_id) values ($1, $2)`, [quartoId, aceita.convocacaoId]);

    await subir();

    expect(await convocacoes()).toEqual({
      "Sara Sugerida": { status: "ACEITA", deslocamento: null, avisada: false },
      "Caio Convidado": { status: "ACEITA", deslocamento: null, avisada: true },
      "Ana Aceita": { status: "ACEITA", deslocamento: null, avisada: true },
      "Rui Recusou": { status: "RECUSADA", deslocamento: "CARRO_PROPRIO", avisada: true },
      "Clara Cancelada": { status: "CANCELADA", deslocamento: "VOO", avisada: true },
    });

    // Só quem já ocupava quarto fica marcado para hotel, e continua no quarto.
    expect(await banco.sql(`select p.nome_completo as nome from eventos.convocacao c join core.pessoa p on p.id = c.pessoa_id where c.precisa_hotel`)).toEqual([
      { nome: "Ana Aceita" },
    ]);
    expect(await banco.sql(`select convocacao_id from eventos.quarto_ocupante`)).toEqual([{ convocacao_id: aceita.convocacaoId }]);

    // O status anterior fica no histórico, pelo sistema.
    expect(
      await banco.sql(
        `select status_de, status_para, origem, usuario_id from eventos.registro_acao
          where entidade = 'CONVOCACAO' and acao = 'CONFIRMADA_PELA_MIGRACAO' and evento_id = $1 order by status_de`,
        [eventoId],
      ),
    ).toEqual([
      { status_de: "CONVIDADA", status_para: "ACEITA", origem: "SISTEMA", usuario_id: null },
      { status_de: "SUGERIDA", status_para: "ACEITA", origem: "SISTEMA", usuario_id: null },
    ]);

    // Pai / mãe vira cargo do evento e sai das habilitações; as outras funções da pessoa ficam.
    expect(await banco.sql(`select codigo from eventos.funcao where cargo_do_evento`)).toEqual([{ codigo: "PAI_MAE" }]);
    expect(await banco.sql(`select f.codigo from eventos.pessoa_funcao pf join eventos.funcao f on f.id = pf.funcao_id order by 1`)).toEqual([{ codigo: "STAFF" }]);
    expect(await banco.sql(`select dados from eventos.registro_acao where entidade = 'PESSOA' and acao = 'FUNCAO_RETIRADA' order by dados->>'nivel'`)).toEqual([
      { dados: { migration: "0013", funcao: "PAI_MAE", nivel: "HABILITADO" } },
      { dados: { migration: "0013", funcao: "PAI_MAE", nivel: "TRAINEE" } },
    ]);
    // A vaga de Pai / mãe da escala continua existindo.
    expect((await um(`select funcao_id from eventos.escala where id = $1`, [escalaId])).funcao_id).toBe(paiMaeId);

    expect(await banco.sql(`select nome, ativo, cargo_do_evento from eventos.funcao where codigo = 'TRAINEE_LIDER'`)).toEqual([
      { nome: "Trainee de líder", ativo: true, cargo_do_evento: false },
    ]);
  });

  it("depois da 0013 o deslocamento só aceita as opções que ficaram", async () => {
    for (const antigo of ["MOTO", "A_PE", "NAO_SE_APLICA"]) {
      await expect(banco.sql(`update eventos.convocacao set deslocamento = $1 where escala_id = $2`, [antigo, escalaId])).rejects.toThrow(/convocacao_deslocamento_check/);
    }
    for (const atual of ["CARRO_PROPRIO", "CARONA", "CARRO_IAM", "UBER", "ONIBUS", "VOO"]) {
      await banco.sql(`update eventos.convocacao set deslocamento = $1 where escala_id = $2 and status = 'RECUSADA'`, [atual, escalaId]);
    }
  });

  it("o .down.sql devolve a situação e a habilitação de Pai / mãe a quem a migration mudou", async () => {
    await descer();
    expect(Object.fromEntries(Object.entries(await convocacoes()).map(([nome, { status }]) => [nome, status]))).toEqual({
      "Sara Sugerida": "SUGERIDA",
      "Caio Convidado": "CONVIDADA",
      "Ana Aceita": "ACEITA",
      "Rui Recusou": "RECUSADA",
      "Clara Cancelada": "CANCELADA",
    });
    expect(await banco.sql(`select f.codigo, pf.nivel from eventos.pessoa_funcao pf join eventos.funcao f on f.id = pf.funcao_id order by 1, 2`)).toEqual([
      { codigo: "PAI_MAE", nivel: "HABILITADO" },
      { codigo: "PAI_MAE", nivel: "TRAINEE" },
      { codigo: "STAFF", nivel: "HABILITADO" },
    ]);
    expect(await banco.sql(`select 1 from eventos.funcao where codigo = 'TRAINEE_LIDER'`)).toEqual([]);
    // E a migration aplica de novo sobre o que voltou.
    await subir();
    expect((await convocacoes())["Sara Sugerida"]).toEqual({ status: "ACEITA", deslocamento: null, avisada: false });
  });
});
