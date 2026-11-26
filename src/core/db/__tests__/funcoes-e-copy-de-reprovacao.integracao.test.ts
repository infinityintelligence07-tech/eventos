import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

// Migrations 0021 (funções da escala) e 0022 (modelo de copy "Reprovação de custo"), pedidos do Vitor em 26/11/2026.

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const APAGADAS = ["APLICATIVO", "FILMMAKER", "LOGISTICA", "MUSICISTA", "PAI_MAE", "PALCO", "SOM", "TRAINEE_LIDER"];

describe.skipIf(!TEST_DATABASE_URL)("migrations 0021 (funções) e 0022 (copy de reprovação de custo)", () => {
  let banco: BancoDeTeste;

  // Sem BEGIN/COMMIT: os comandos vão numa mensagem só, que o Postgres trata como uma transação (se um falha, nada
  // fica aplicado e a conexão volta limpa para o pool).
  const rodar = (arquivo: string) => banco.sql(readFileSync(path.join(MIGRATIONS, arquivo), "utf8").replaceAll("--> statement-breakpoint", ""));
  const codigos = async (filtro: string) => ((await banco.sql(`select codigo from eventos.funcao where ${filtro} order by codigo`)) as { codigo: string }[]).map((linha) => linha.codigo);
  const regraDoConfronto = async () =>
    ((await banco.sql(`select linha ->> 'funcao' as funcao from eventos.tipo_evento t, jsonb_array_elements(t.regra_vagas -> 'funcoes') linha where t.sigla = 'CONF'`)) as { funcao: string }[]).map((linha) => linha.funcao);

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("0021: as oito funções saem, Líder vira Líder de Confronto e entram os dois trainees", async () => {
    expect(await codigos(`codigo = any('{${APAGADAS.join(",")}}')`)).toEqual([]);
    expect(await banco.sql(`select nome from eventos.funcao where codigo = 'LIDER'`)).toEqual([{ nome: "Líder de Confronto" }]);
    expect(await banco.sql(`select codigo, nome, ativo, cargo_do_evento from eventos.funcao where codigo like 'TRAINEE_LIDER_%' order by codigo`)).toEqual([
      { codigo: "TRAINEE_LIDER_CONFRONTO", nome: "Trainee de líder de confronto", ativo: true, cargo_do_evento: false },
      { codigo: "TRAINEE_LIDER_EVENTO", nome: "Trainee de líder de evento", ativo: true, cargo_do_evento: false },
    ]);
    // A regra do Confronto não cita mais Pai / mãe; as outras linhas ficam, na ordem.
    expect(await regraDoConfronto()).toEqual(["LIDER", "DJ", "SOCIAL_MEDIA", "FOTOGRAFO", "CAMARIM"]);
  });

  it("0021: o .down.sql devolve as funções e a regra; a migration sobe de novo e leva junto a habilitação das pessoas", async () => {
    await rodar("0021_funcoes-da-escala.down.sql");
    expect(await codigos(`codigo = any('{${APAGADAS.join(",")}}')`)).toEqual(APAGADAS);
    expect(await codigos("cargo_do_evento")).toEqual(["PAI_MAE"]);
    expect(await banco.sql(`select nome from eventos.funcao where codigo = 'LIDER'`)).toEqual([{ nome: "Líder" }]);
    expect(await regraDoConfronto()).toEqual(["LIDER", "PAI_MAE", "DJ", "SOCIAL_MEDIA", "FOTOGRAFO", "CAMARIM"]);

    const [pessoa] = (await banco.sql(`insert into core.pessoa (nome_completo) values ('Paula do Palco') returning id`)) as { id: string }[];
    await banco.sql(`insert into eventos.pessoa_evento (pessoa_id) values ($1)`, [pessoa!.id]);
    await banco.sql(`insert into eventos.pessoa_funcao (pessoa_id, funcao_id, nivel) select $1, id, 'HABILITADO' from eventos.funcao where codigo in ('PALCO', 'STAFF')`, [pessoa!.id]);

    await rodar("0021_funcoes-da-escala.sql");
    expect(await codigos(`codigo = any('{${APAGADAS.join(",")}}')`)).toEqual([]);
    expect(await banco.sql(`select f.codigo from eventos.pessoa_funcao pf join eventos.funcao f on f.id = pf.funcao_id where pf.pessoa_id = $1`, [pessoa!.id])).toEqual([{ codigo: "STAFF" }]);
  });

  it("0021: com linha de escala numa função que seria apagada, para sem mudar nada", async () => {
    await rodar("0021_funcoes-da-escala.down.sql");
    const [tipo] = (await banco.sql(`select id from eventos.tipo_evento where sigla = 'CONF'`)) as { id: string }[];
    const [evento] = (await banco.sql(
      `insert into eventos.evento (nome, codigo, inicio, fim, status, tipo_evento_id) values ('Conf da Trava', 'CONF_TRAVA', '2026-12-10T12:00:00Z', '2026-12-12T22:00:00Z', 'PLANEJADO', $1) returning id`,
      [tipo!.id],
    )) as { id: string }[];
    const [linha] = (await banco.sql(
      `insert into eventos.escala (evento_id, funcao_id, data, hora_inicio, hora_fim, quantidade_vagas, status) select $1, id, '2026-12-10', '08:00', '18:00', 2, 'ABERTA' from eventos.funcao where codigo = 'PALCO' returning id`,
      [evento!.id],
    )) as { id: string }[];

    await expect(rodar("0021_funcoes-da-escala.sql")).rejects.toThrow(/linha\(s\) de escala/);
    expect(await codigos(`codigo = any('{${APAGADAS.join(",")}}')`)).toEqual(APAGADAS);
    expect(await banco.sql(`select nome from eventos.funcao where codigo = 'LIDER'`)).toEqual([{ nome: "Líder" }]);

    // Sem a linha, aplica.
    await banco.sql(`delete from eventos.escala where id = $1`, [linha!.id]);
    await rodar("0021_funcoes-da-escala.sql");
    expect(await codigos(`codigo = any('{${APAGADAS.join(",")}}')`)).toEqual([]);
  });

  it("0022: nasce um modelo ativo de reprovação de custo e o CHECK aceita o tipo novo; o .down.sql devolve o CHECK antigo", async () => {
    const modelos = (await banco.sql(`select nome, ativo, corpo from eventos.modelo_copy where tipo = 'REPROVACAO_CUSTO'`)) as { nome: string; ativo: boolean; corpo: string }[];
    expect(modelos).toHaveLength(1);
    expect(modelos[0]).toMatchObject({ nome: "Reprovação de custo", ativo: true });
    expect(modelos[0]!.corpo).toContain("{{custo.motivo}}");
    await expect(banco.sql(`insert into eventos.modelo_copy (tipo, nome, corpo, ativo) values ('OUTRO', 'x', 'y', false)`)).rejects.toThrow(/modelo_copy_tipo_check/);

    await rodar("0022_copy-de-reprovacao-de-custo.down.sql");
    expect(await banco.sql(`select 1 from eventos.modelo_copy where tipo = 'REPROVACAO_CUSTO'`)).toEqual([]);
    await expect(banco.sql(`insert into eventos.modelo_copy (tipo, nome, corpo, ativo) values ('REPROVACAO_CUSTO', 'x', 'y', false)`)).rejects.toThrow(/modelo_copy_tipo_check/);

    // Aplicar duas vezes não duplica o modelo.
    await rodar("0022_copy-de-reprovacao-de-custo.sql");
    await banco.sql(
      `insert into eventos.modelo_copy (tipo, nome, corpo, ativo) select 'REPROVACAO_CUSTO', 'Reprovação de custo', 'x', true where not exists (select 1 from eventos.modelo_copy where tipo = 'REPROVACAO_CUSTO')`,
    );
    expect(await banco.sql(`select count(*)::int as n from eventos.modelo_copy where tipo = 'REPROVACAO_CUSTO'`)).toEqual([{ n: 1 }]);
  });
});
