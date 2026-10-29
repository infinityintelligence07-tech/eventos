import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

// Migration 0005 + proposta do GH (doc 09 §6 e §8): o que cada papel do app pode e não pode, e as chaves
// do registro_acao em RESTRICT. Roda com SET ROLE, então grants e RLS valem de verdade.
describe.skipIf(!TEST_DATABASE_URL)("papéis do app e histórico protegido", () => {
  let banco: BancoDeTeste;
  let eventoId: string;
  let pessoaId: string;
  let usuarioId: string;

  const primeiro = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;
  const PERMISSAO_NEGADA = /permission denied/;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    usuarioId = (await primeiro(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id!;
    pessoaId = (await primeiro(`insert into core.pessoa (nome_completo, usuario_id) values ('Pessoa de teste', $1) returning id`, [usuarioId])).id!;
    eventoId = (
      await primeiro(
        `insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now(), now() + interval '1 day', 'PLANEJADO') returning id`,
      )
    ).id!;
    await banco.sql(
      `insert into eventos.registro_acao (entidade, entidade_id, evento_id, acao, em_nome_de_pessoa_id, usuario_id)
       values ('EVENTO', $1, $1, 'DADOS_DO_EVENTO_ALTERADOS', $2, $3)`,
      [eventoId, pessoaId, usuarioId],
    );
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("app_eventos não lê sensivel, gh nem auditoria", async () => {
    await expect(banco.comoPapel("app_eventos", "select * from sensivel.pessoa_dado_sensivel")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "select * from sensivel.pessoa_dados_bancarios")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "select * from gh.beneficio")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "select * from auditoria.audit_log")).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("app_eventos inclui e lê o histórico, mas não altera nem apaga", async () => {
    await banco.comoPapel(
      "app_eventos",
      `insert into eventos.registro_acao (entidade, entidade_id, evento_id, acao, usuario_id) values ('EVENTO', $1, $1, 'LIDO', $2)`,
      [eventoId, usuarioId],
    );
    expect(await banco.comoPapel("app_eventos", "select id from eventos.registro_acao")).toHaveLength(1);
    await expect(banco.comoPapel("app_eventos", "update eventos.registro_acao set comentario = 'x'")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "delete from eventos.registro_acao")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "truncate eventos.registro_acao")).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("app_eventos grava nas tabelas do app e só apaga onde o código apaga", async () => {
    await banco.comoPapel("app_eventos", "update eventos.evento set expectativa_publico = 10 where id = $1", [eventoId]);
    await banco.comoPapel("app_eventos", "select referencia from eventos.pedido_sdc");
    await expect(banco.comoPapel("app_eventos", "delete from eventos.evento where id = $1", [eventoId])).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "delete from eventos.escala")).rejects.toThrow(PERMISSAO_NEGADA);
    await banco.comoPapel("app_eventos", "delete from eventos.convocacao where false");
  });

  it("app_eventos lê do core só as colunas liberadas e não escreve nele", async () => {
    expect(await banco.comoPapel("app_eventos", "select id, nome_completo, nome_social from core.pessoa")).toHaveLength(1);
    expect(await banco.comoPapel("app_eventos", "select codigo from core.perfil where codigo like 'EVENTOS_%'")).toHaveLength(2);
    await expect(banco.comoPapel("app_eventos", "select data_nascimento from core.pessoa")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "select salario_ou_diaria from core.vinculo")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", "update core.pessoa set nome_social = 'x'")).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("app_eventos não cria evento nem mexe nas colunas da sincronização (B4)", async () => {
    await expect(
      banco.comoPapel("app_eventos", `insert into eventos.evento (nome, inicio, fim, status) values ('x', now(), now(), 'PLANEJADO')`),
    ).rejects.toThrow(PERMISSAO_NEGADA);
    for (const coluna of ["iam_control_turma_id = 1", "codigo = 'ASM_AM_1'", "sincronizado_em = now()", "inicio = now()", "status = 'CANCELADO'"]) {
      await expect(banco.comoPapel("app_eventos", `update eventos.evento set ${coluna} where id = $1`, [eventoId])).rejects.toThrow(PERMISSAO_NEGADA);
    }
    await banco.comoPapel(
      "app_eventos",
      `update eventos.evento set status_escala = 'RASCUNHO', pessoas_na_fila = 3, atualizado_em = now() where id = $1`,
      [eventoId],
    );
  });

  it("tipo_evento só na regra de vagas, funcao só leitura e local cadastrável pelo time (B4)", async () => {
    await banco.comoPapel("app_eventos", `update eventos.tipo_evento set regra_vagas = regra_vagas, atualizado_em = now() where sigla = 'ASM'`);
    await expect(banco.comoPapel("app_eventos", `update eventos.tipo_evento set sigla = 'X' where sigla = 'ASM'`)).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", `insert into eventos.tipo_evento (sigla, nome) values ('NOVO', 'Novo')`)).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", `insert into eventos.funcao (codigo, nome) values ('NOVA', 'Nova')`)).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos", `update eventos.funcao set nome = 'x'`)).rejects.toThrow(PERMISSAO_NEGADA);
    const [local] = (await banco.comoPapel(
      "app_eventos",
      `insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel X', 'HOTEL', 'Americana', 'SP') returning id`,
    )) as { id: string }[];
    expect(local?.id).toBeTruthy();
    await expect(banco.comoPapel("app_eventos", `update eventos.local set criado_em = now()`)).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("core.pessoa: o app só vê pessoas ligadas ao Eventos (M3)", async () => {
    const sem = (await primeiro(`insert into core.pessoa (nome_completo, telefone) values ('Sem vínculo', '(11) 90000-9999') returning id`)).id!;
    const staff = (await primeiro(`insert into core.pessoa (nome_completo) values ('Staff') returning id`)).id!;
    await banco.sql(`insert into eventos.pessoa_evento (pessoa_id) values ($1)`, [staff]);
    const usuarioDoTime = (await primeiro(`insert into core.usuario (email) values ('lider@exemplo.test') returning id`)).id!;
    const doTime = (await primeiro(`insert into core.pessoa (nome_completo, usuario_id) values ('Líder', $1) returning id`, [usuarioDoTime])).id!;
    await banco.sql(
      `insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = 'EVENTOS_LIDER'`,
      [usuarioDoTime],
    );
    const usuarioDeFora = (await primeiro(`insert into core.usuario (email) values ('gh@exemplo.test') returning id`)).id!;
    const deFora = (await primeiro(`insert into core.pessoa (nome_completo, usuario_id) values ('Só do GH', $1) returning id`, [usuarioDeFora])).id!;

    for (const papel of ["app_eventos", "app_eventos_leitura"] as const) {
      const vistas = ((await banco.comoPapel(papel, "select id from core.pessoa")) as { id: string }[]).map((linha) => linha.id);
      expect(vistas).toEqual(expect.arrayContaining([staff, doTime, pessoaId]));
      expect(vistas).not.toContain(sem);
      expect(vistas).not.toContain(deFora);
      expect(await banco.comoPapel(papel, "select telefone from core.pessoa where id = $1", [sem])).toEqual([]);
      // core.usuario continua inteiro: o login procura pelo e-mail.
      expect(await banco.comoPapel(papel, "select id from core.usuario where id = $1", [usuarioDeFora])).toHaveLength(1);
    }
  });

  it("app_eventos lê o marcador do banco que a guarda de escrita confere", async () => {
    await banco.comoPapel("app_eventos", "select setconfig from pg_catalog.pg_db_role_setting");
  });

  it("presenca (do GH) é só leitura para app_eventos e app_eventos_leitura", async () => {
    expect(await banco.comoPapel("app_eventos_leitura", "select id, status from eventos.presenca")).toEqual([]);
    expect(await banco.comoPapel("app_eventos", "select id, status from eventos.presenca")).toEqual([]);
    await expect(banco.comoPapel("app_eventos", "delete from eventos.presenca")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos_copia", "select id from eventos.presenca")).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("app_eventos_leitura só lê e app_eventos_copia só vê as tabelas copiadas", async () => {
    expect(await banco.comoPapel("app_eventos_leitura", "select id from eventos.evento")).toHaveLength(1);
    await expect(
      banco.comoPapel("app_eventos_leitura", "update eventos.evento set expectativa_publico = 1 where id = $1", [eventoId]),
    ).rejects.toThrow(/permission denied|read-only transaction/);
    expect(await banco.comoPapel("app_eventos_copia", "select id from eventos.evento")).toHaveLength(1);
    expect(await banco.comoPapel("app_eventos_copia", "select codigo from core.polo")).toEqual([]);
    await expect(banco.comoPapel("app_eventos_copia", "select id from core.pessoa")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos_copia", "select id from eventos.convocacao")).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("apagar usuário, pessoa ou evento citados no histórico é recusado (RESTRICT)", async () => {
    await expect(banco.sql("delete from core.usuario where id = $1", [usuarioId])).rejects.toThrow(/registro_acao_usuario_id_usuario_id_fk/);
    await expect(banco.sql("delete from core.pessoa where id = $1", [pessoaId])).rejects.toThrow(/registro_acao_em_nome_de_pessoa_id_pessoa_id_fk/);
    await expect(banco.sql("delete from eventos.evento where id = $1", [eventoId])).rejects.toThrow(/registro_acao_evento_id_evento_id_fk/);
  });
});
