import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

// Regras da migration 0004 que valem mesmo com bug na aplicação.
describe.skipIf(!TEST_DATABASE_URL)("migration 0004: registro de ações, convocação, mensagem e SDC", () => {
  let banco: BancoDeTeste;
  let eventoId: string;
  let pessoaId: string;

  const primeiro = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    eventoId = (
      await primeiro(
        `insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now(), now() + interval '1 day', 'PLANEJADO') returning id`,
      )
    ).id!;
    pessoaId = (await primeiro(`insert into core.pessoa (nome_completo) values ('Pessoa de teste') returning id`)).id!;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("registro_acao aceita inclusão e recusa alteração, exclusão e truncate", async () => {
    await banco.sql(
      `insert into eventos.registro_acao (entidade, entidade_id, evento_id, acao, status_de, status_para)
       values ('ESCALA_DO_EVENTO', $1, $1, 'DEVOLVIDA', 'AGUARDANDO_APROVACAO', 'DEVOLVIDA')`,
      [eventoId],
    );
    await expect(banco.sql(`update eventos.registro_acao set comentario = 'x'`)).rejects.toThrow(/só de inclusão/);
    await expect(banco.sql(`delete from eventos.registro_acao`)).rejects.toThrow(/só de inclusão/);
    await expect(banco.sql(`truncate eventos.registro_acao`)).rejects.toThrow(/só de inclusão/);
  });

  it("registro_acao aceita CARONA, REGRA_CUSTO e MODELO_COPY e recusa entidade desconhecida", async () => {
    for (const entidade of ["CARONA", "REGRA_CUSTO", "MODELO_COPY"]) {
      await banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao) values ($1, $2, 'ALTERADA')`, [entidade, eventoId]);
    }
    await expect(
      banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao) values ('LOCAL', $1, 'ALTERADA')`, [eventoId]),
    ).rejects.toThrow(/registro_acao_entidade_check/);
  });

  it("copy de escalação passa a usar o gênero da pessoa, com um modelo ativo por tipo", async () => {
    const [escalacao] = (await banco.sql(`select corpo from eventos.modelo_copy where tipo = 'ESCALACAO' and ativo`)) as { corpo: string }[];
    expect(escalacao?.corpo).toContain("{{genero:ESCALADO|ESCALADA}}");
    expect(escalacao?.corpo).not.toContain("ESCALADO(A)");
    const repetidos = await banco.sql(`select tipo from eventos.modelo_copy where ativo group by tipo having count(*) > 1`);
    expect(repetidos).toEqual([]);
  });

  it("status de escala aceita AGUARDANDO_APROVACAO e DEVOLVIDA, sem data de aprovação", async () => {
    await banco.sql(`update eventos.evento set status_escala = 'AGUARDANDO_APROVACAO' where id = $1`, [eventoId]);
    await banco.sql(`update eventos.evento set status_escala = 'DEVOLVIDA' where id = $1`, [eventoId]);
    await expect(
      banco.sql(`update eventos.evento set aprovado_em = now() where id = $1`, [eventoId]),
    ).rejects.toThrow(/evento_aprovacao_check/);
  });

  it("convocação só aceita os status novos", async () => {
    const escalaId = (
      await primeiro(
        `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status)
         values ($1, current_date, '08:00', '18:00', 2, 'ABERTA') returning id`,
        [eventoId],
      )
    ).id!;
    await banco.sql(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, 'ACEITA')`, [escalaId, pessoaId]);
    await expect(
      banco.sql(`update eventos.convocacao set status = 'CONFIRMADA' where escala_id = $1`, [escalaId]),
    ).rejects.toThrow(/convocacao_status_check/);
  });

  it("pedido à SDC numera SDC-000001 e aceita um só voo ativo por pessoa no evento", async () => {
    const pedido = await primeiro(
      `insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning referencia`,
      [eventoId, pessoaId],
    );
    expect(pedido.referencia).toMatch(/^SDC-\d{6}$/);
    await expect(
      banco.sql(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2)`, [eventoId, pessoaId]),
    ).rejects.toThrow(/pedido_sdc_voo_ativo_unique/);
    await expect(
      banco.sql(`insert into eventos.pedido_sdc (tipo, evento_id) values ('VOO', $1)`, [eventoId]),
    ).rejects.toThrow(/pedido_sdc_passageiro_check/);
  });

  it("tabelas novas nascem com RLS ligada", async () => {
    const semRls = await banco.sql(
      `select tablename from pg_tables where schemaname = 'eventos' and not rowsecurity`,
    );
    expect(semRls).toEqual([]);
  });
});
