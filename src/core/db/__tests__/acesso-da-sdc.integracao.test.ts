import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0016_acesso-da-sdc";

// A 0016 roda sobre dados que já existem (pedidos emitidos, histórico). O banco de teste nasce com ela aplicada, então
// o teste volta com o .down.sql, grava dados como eram antes e aplica de novo. Cada arquivo vai numa chamada só: o
// Postgres roda o lote numa transação implícita e desfaz tudo se um comando falha.
describe.skipIf(!TEST_DATABASE_URL)("migration 0016 (acesso da SDC e aprovação do pagamento) sobre dados existentes", () => {
  let banco: BancoDeTeste;
  let usuarioId: string;
  let eventoId: string;
  let emitidoId: string;
  let pedidoId: string;
  let sdcId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const subir = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  const descer = () => banco.sql(readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8"));
  const novidades = async () => ({
    tabela: (await um(`select to_regclass('eventos.acesso_sdc') is not null as existe`)).existe,
    colunas: (
      (await banco.sql(
        `select table_name || '.' || column_name as coluna from information_schema.columns
          where table_schema = 'eventos' and column_name in ('retorno_registrado_pela_sdc', 'aprovado_em', 'aprovado_por', 'observacao_aprovacao', 'acesso_sdc_id')
            and table_name in ('pedido_sdc', 'registro_acao') order by 1`,
      )) as { coluna: string }[]
    ).map((linha) => linha.coluna),
  });
  const NEGADO = /permission denied/;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await descer();
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    eventoId = (
      await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now() + interval '10 days', now() + interval '12 days', 'PLANEJADO') returning id`)
    ).id as string;
    const { id: pessoaId } = await um(`insert into core.pessoa (nome_completo) values ('Pessoa de teste') returning id`);
    emitidoId = (
      await um(
        `insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id, situacao, valor_centavos, emitido_em, retorno_registrado_por)
         values ('VOO', $1, $2, 'EMITIDO', 98000, now(), $3) returning id`,
        [eventoId, pessoaId, usuarioId],
      )
    ).id as string;
    pedidoId = (await um(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning id`, [eventoId, pessoaId])).id as string;
    await banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao, origem, usuario_id) values ('PEDIDO_SDC', $1, 'RETORNO_REGISTRADO', 'USUARIO', $2)`, [emitidoId, usuarioId]);
    await banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao, origem) values ('PEDIDO_SDC', $1, 'ANTIGA_DO_SISTEMA', 'SISTEMA')`, [emitidoId]);
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("antes da 0016: sem a lista, sem as colunas e o histórico não aceita a origem SDC", async () => {
    expect(await novidades()).toEqual({ tabela: false, colunas: [] });
    await expect(banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao, origem) values ('PEDIDO_SDC', $1, 'TESTE', 'SDC')`, [emitidoId])).rejects.toThrow(/registro_acao_origem_check/);
  });

  it("aplica sem mexer no que já existe: pedidos e histórico continuam iguais, e o emitido fica a aprovar", async () => {
    const antes = {
      pedidos: await banco.sql(`select id, situacao, valor_centavos, retorno_registrado_por, atualizado_em from eventos.pedido_sdc order by id`),
      historico: await banco.sql(`select id, acao, origem, usuario_id, criado_em from eventos.registro_acao order by id`),
    };
    await subir();
    expect(await novidades()).toEqual({
      tabela: true,
      colunas: ["pedido_sdc.aprovado_em", "pedido_sdc.aprovado_por", "pedido_sdc.observacao_aprovacao", "pedido_sdc.retorno_registrado_pela_sdc", "registro_acao.acesso_sdc_id"],
    });
    expect({
      pedidos: await banco.sql(`select id, situacao, valor_centavos, retorno_registrado_por, atualizado_em from eventos.pedido_sdc order by id`),
      historico: await banco.sql(`select id, acao, origem, usuario_id, criado_em from eventos.registro_acao order by id`),
    }).toEqual(antes);
    expect(await banco.sql(`select aprovado_em, aprovado_por, observacao_aprovacao, retorno_registrado_pela_sdc from eventos.pedido_sdc where aprovado_em is not null or retorno_registrado_pela_sdc is not null`)).toEqual([]);
    expect(await um(`select count(*)::int as n from eventos.acesso_sdc`)).toEqual({ n: 0 });
    expect(await um(`select count(*)::int as n from eventos.registro_acao where acesso_sdc_id is not null`)).toEqual({ n: 0 });
  });

  it("o banco só aceita aprovação de compra emitida com valor, e observação só junto da aprovação", async () => {
    await banco.sql(`update eventos.pedido_sdc set aprovado_em = now(), aprovado_por = $2, observacao_aprovacao = 'usamos' where id = $1`, [emitidoId, usuarioId]);
    await expect(banco.sql(`update eventos.pedido_sdc set aprovado_em = now() where id = $1`, [pedidoId])).rejects.toThrow(/pedido_sdc_aprovacao_check/);
    await expect(banco.sql(`update eventos.pedido_sdc set situacao = 'CANCELADO' where id = $1`, [emitidoId])).rejects.toThrow(/pedido_sdc_aprovacao_check/);
    await expect(banco.sql(`update eventos.pedido_sdc set valor_centavos = null where id = $1`, [emitidoId])).rejects.toThrow(/pedido_sdc_aprovacao_check/);
    await expect(banco.sql(`update eventos.pedido_sdc set observacao_aprovacao = 'sem aprovar' where id = $1`, [pedidoId])).rejects.toThrow(/pedido_sdc_aprovacao_obs_check/);
    await banco.sql(`update eventos.pedido_sdc set aprovado_em = null, aprovado_por = null, observacao_aprovacao = null where id = $1`, [emitidoId]);
  });

  it("a compra tem um autor só: o time OU a SDC, nunca os dois", async () => {
    const { id: daSdc } = await um(`insert into eventos.acesso_sdc (email, nome) values ('autor.sdc@exemplo.test', 'Autor SDC') returning id`);
    await expect(banco.sql(`update eventos.pedido_sdc set retorno_registrado_pela_sdc = $2 where id = $1`, [emitidoId, daSdc])).rejects.toThrow(/pedido_sdc_retorno_autor_check/);
    await banco.sql(`update eventos.pedido_sdc set retorno_registrado_por = null, retorno_registrado_pela_sdc = $2 where id = $1`, [emitidoId, daSdc]);
    await expect(banco.sql(`update eventos.pedido_sdc set retorno_registrado_por = $2 where id = $1`, [emitidoId, usuarioId])).rejects.toThrow(/pedido_sdc_retorno_autor_check/);
    await banco.sql(`update eventos.pedido_sdc set retorno_registrado_por = $2, retorno_registrado_pela_sdc = null where id = $1`, [emitidoId, usuarioId]);
  });

  it("o histórico diz quem fez: USUARIO com usuário, SDC com a linha da lista, SISTEMA sem nenhum dos dois", async () => {
    sdcId = (await um(`insert into eventos.acesso_sdc (email, nome, criado_por) values ('atendimento.sdc@exemplo.test', 'SDC (teste)', $1) returning id`, [usuarioId])).id as string;
    const registrar = (origem: string, usuario: string | null, acesso: string | null) =>
      banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao, origem, usuario_id, acesso_sdc_id) values ('PEDIDO_SDC', $1, 'TESTE', $2, $3, $4)`, [emitidoId, origem, usuario, acesso]);
    for (const [origem, usuario, acesso] of [
      ["SDC", null, null],
      ["SDC", usuarioId, null],
      ["SDC", usuarioId, sdcId],
      ["USUARIO", null, sdcId],
      ["USUARIO", usuarioId, sdcId],
      ["SISTEMA", null, sdcId],
      ["SISTEMA", usuarioId, null],
    ] as const) {
      await expect(registrar(origem, usuario, acesso), `${origem} ${usuario ? "com" : "sem"} usuário, ${acesso ? "com" : "sem"} SDC`).rejects.toThrow(/registro_acao_autoria_check/);
    }
    await expect(registrar("OUTRA", null, null)).rejects.toThrow(/registro_acao_origem_check/);
    await registrar("USUARIO", usuarioId, null);
    await registrar("SISTEMA", null, null);
  });

  it("privilégio mínimo na lista: o app inclui e só muda nome e ativo; as páginas só leem; worker e cópia não enxergam", async () => {
    expect(await um(`select relrowsecurity from pg_class where oid = 'eventos.acesso_sdc'::regclass`)).toEqual({ relrowsecurity: true });
    const linha = [sdcId];
    expect(await banco.comoPapel("app_eventos", `insert into eventos.acesso_sdc (email, nome) values ('outra@exemplo.test', 'Outra') returning ativo`)).toEqual([{ ativo: true }]);
    expect(await banco.comoPapel("app_eventos", `update eventos.acesso_sdc set ativo = false, nome = 'Novo nome', atualizado_em = now() where id = $1 returning ativo`, linha)).toEqual([{ ativo: false }]);
    await expect(banco.comoPapel("app_eventos", `update eventos.acesso_sdc set email = 'trocado@exemplo.test' where id = $1`, linha)).rejects.toThrow(NEGADO);
    await expect(banco.comoPapel("app_eventos", `update eventos.acesso_sdc set criado_por = null where id = $1`, linha)).rejects.toThrow(NEGADO);
    await expect(banco.comoPapel("app_eventos", `delete from eventos.acesso_sdc where id = $1`, linha)).rejects.toThrow(NEGADO);

    expect(await banco.comoPapel("app_eventos_leitura", `select email, ativo from eventos.acesso_sdc where id = $1`, linha)).toEqual([{ email: "atendimento.sdc@exemplo.test", ativo: true }]);
    await expect(banco.comoPapel("app_eventos_leitura", `insert into eventos.acesso_sdc (email, nome) values ('x@exemplo.test', 'X Y')`)).rejects.toThrow(NEGADO);
    await expect(banco.comoPapel("app_eventos_leitura", `update eventos.acesso_sdc set ativo = true where id = $1`, linha)).rejects.toThrow(NEGADO);
    for (const papel of ["app_eventos_copia", "app_eventos_worker"] as const) {
      await expect(banco.comoPapel(papel, `select 1 from eventos.acesso_sdc`), papel).rejects.toThrow(NEGADO);
    }
  });

  it("o app grava a compra da SDC e a aprovação com o papel de escrita; o histórico da SDC não se altera nem se apaga", async () => {
    expect(
      await banco.comoPapel(
        "app_eventos",
        `with compra as (update eventos.pedido_sdc set situacao = 'EMITIDO', valor_centavos = 5000, emitido_em = now(), retorno_registrado_pela_sdc = $2 where id = $1 returning id)
         insert into eventos.registro_acao (entidade, entidade_id, acao, origem, acesso_sdc_id) select 'PEDIDO_SDC', id, 'RETORNO_REGISTRADO', 'SDC', $2 from compra returning origem`,
        [pedidoId, sdcId],
      ),
    ).toEqual([{ origem: "SDC" }]);
    expect(await banco.comoPapel("app_eventos", `update eventos.pedido_sdc set aprovado_em = now(), aprovado_por = $2 where id = $1 returning aprovado_por`, [emitidoId, usuarioId])).toEqual([
      { aprovado_por: usuarioId },
    ]);
    await expect(banco.comoPapel("app_eventos_leitura", `update eventos.pedido_sdc set aprovado_em = now() where id = $1`, [emitidoId])).rejects.toThrow(NEGADO);

    await banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, acao, origem, acesso_sdc_id) values ('PEDIDO_SDC', $1, 'RETORNO_REGISTRADO', 'SDC', $2)`, [pedidoId, sdcId]);
    await expect(banco.sql(`update eventos.registro_acao set acesso_sdc_id = null, origem = 'SISTEMA' where acesso_sdc_id = $1`, [sdcId])).rejects.toThrow();
    // Quem já agiu não some da lista: o histórico aponta para a linha (desativa-se, não se apaga).
    await expect(banco.sql(`delete from eventos.acesso_sdc where id = $1`, [sdcId])).rejects.toThrow(/registro_acao_acesso_sdc_id_acesso_sdc_id_fk/);
  });

  it("o down não apaga a autoria: com ação da SDC no histórico ele para, e nada é desfeito", async () => {
    await expect(descer()).rejects.toThrow(/o histórico já tem ações da SDC/);
    expect((await novidades()).tabela).toBe(true);
    expect(await um(`select count(*)::int as n from eventos.registro_acao where origem = 'SDC'`)).toEqual({ n: 1 });
  });
});
