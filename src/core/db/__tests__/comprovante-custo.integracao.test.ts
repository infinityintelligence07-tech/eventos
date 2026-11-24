import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");
const ARQUIVO = "0014_comprovante-custo";

// A 0014 só acrescenta (tabela nova e um valor no CHECK do histórico). O banco de teste nasce com ela aplicada; aqui
// ficam os privilégios de cada papel, as travas da tabela e a ida e volta com o .down.sql.
describe.skipIf(!TEST_DATABASE_URL)("migration 0014: comprovantes de custo", () => {
  let banco: BancoDeTeste;
  let eventoId: string;
  let pessoaId: string;
  let usuarioId: string;
  let solicitacaoId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;
  const subir = () => banco.sql(`BEGIN;\n${readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.sql`), "utf8").replaceAll("--> statement-breakpoint", "")}\n;COMMIT;`);
  const descer = () => banco.sql(`BEGIN;\n${readFileSync(path.join(MIGRATIONS, `${ARQUIVO}.down.sql`), "utf8")}\n;COMMIT;`);
  const PERMISSAO_NEGADA = /permission denied/;
  const INSERIR = `insert into eventos.comprovante_custo (evento_id, pessoa_id, chave, nome_original, tipo, tamanho_bytes, enviado_por) values ($1, $2, $3, 'cupom.jpg', $4, $5, $6) returning id`;
  const valores = (chave: string, tipo = "image/jpeg", tamanho = 1234) => [eventoId, pessoaId, chave, tipo, tamanho, usuarioId];

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    usuarioId = (await um(`insert into core.usuario (email) values ('staff@exemplo.test') returning id`)).id!;
    pessoaId = (await um(`insert into core.pessoa (nome_completo, usuario_id) values ('Pessoa de teste', $1) returning id`, [usuarioId])).id!;
    eventoId = (await um(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento de teste', now(), now() + interval '1 day', 'PLANEJADO') returning id`)).id!;
    solicitacaoId = (await um(`insert into eventos.solicitacao_custo (protocolo, evento_id, pessoa_id) values (eventos.proximo_protocolo(), $1, $2) returning id`, [eventoId, pessoaId])).id!;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("o app grava, vincula à solicitação e apaga; as páginas só leem; worker e cópia local não enxergam", async () => {
    await banco.sql(INSERIR, valores("custos/a.jpg"));
    expect(await banco.comoPapel("app_eventos", INSERIR, valores("custos/b.jpg"))).toHaveLength(1);
    expect(await banco.comoPapel("app_eventos", "select chave from eventos.comprovante_custo")).toEqual([{ chave: "custos/a.jpg" }]);
    expect(await banco.comoPapel("app_eventos", "update eventos.comprovante_custo set solicitacao_id = $1 returning id", [solicitacaoId])).toHaveLength(1);
    expect(await banco.comoPapel("app_eventos", "delete from eventos.comprovante_custo returning id")).toHaveLength(1);

    expect(await banco.comoPapel("app_eventos_leitura", "select chave from eventos.comprovante_custo")).toHaveLength(1);
    await expect(banco.comoPapel("app_eventos_leitura", INSERIR, valores("custos/c.jpg"))).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos_leitura", "delete from eventos.comprovante_custo")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos_worker", "select 1 from eventos.comprovante_custo")).rejects.toThrow(PERMISSAO_NEGADA);
    await expect(banco.comoPapel("app_eventos_copia", "select 1 from eventos.comprovante_custo")).rejects.toThrow(PERMISSAO_NEGADA);
  });

  it("a tabela recusa tipo fora da lista, tamanho zero, nome vazio e chave repetida", async () => {
    await expect(banco.sql(INSERIR, valores("custos/x.html", "text/html"))).rejects.toThrow(/comprovante_custo_tipo_check/);
    await expect(banco.sql(INSERIR, valores("custos/x.jpg", "image/jpeg", 0))).rejects.toThrow(/comprovante_custo_tamanho_check/);
    await expect(banco.sql(INSERIR.replace("'cupom.jpg'", "''"), valores("custos/y.jpg"))).rejects.toThrow(/comprovante_custo_nome_check/);
    await expect(banco.sql(INSERIR, valores("custos/a.jpg"))).rejects.toThrow(/comprovante_custo_chave_unique/);
    for (const tipo of ["image/png", "image/webp", "application/pdf"]) await banco.sql(INSERIR, valores(`custos/${tipo.replace("/", "-")}`, tipo));
  });

  it("o histórico aceita a entidade COMPROVANTE_CUSTO, gravada pelo papel do app", async () => {
    const registrar = `insert into eventos.registro_acao (entidade, entidade_id, evento_id, acao, usuario_id) values ('COMPROVANTE_CUSTO', $1, $1, 'COMPROVANTE_ANEXADO', $2) returning id`;
    expect(await banco.comoPapel("app_eventos", registrar, [eventoId, usuarioId])).toHaveLength(1);
    await expect(banco.sql(registrar.replace("COMPROVANTE_CUSTO", "OUTRA_COISA"), [eventoId, usuarioId])).rejects.toThrow(/registro_acao_entidade_check/);
  });

  it("o .down.sql tira a tabela e devolve o CHECK antigo sem tropeçar no histórico já gravado; a migration sobe de novo", async () => {
    await banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, evento_id, acao, usuario_id) values ('COMPROVANTE_CUSTO', $1, $1, 'COMPROVANTE_ANEXADO', $2)`, [eventoId, usuarioId]);
    const antes = await um(`select count(*)::int as n from eventos.solicitacao_custo`);

    await descer();
    expect(await um(`select to_regclass('eventos.comprovante_custo') as tabela`)).toEqual({ tabela: null });
    // O histórico é só de inclusão: a linha fica; as novas voltam a ser recusadas.
    expect(await um(`select count(*)::int as n from eventos.registro_acao where entidade = 'COMPROVANTE_CUSTO'`)).toEqual({ n: 1 });
    await expect(
      banco.sql(`insert into eventos.registro_acao (entidade, entidade_id, evento_id, acao, usuario_id) values ('COMPROVANTE_CUSTO', $1, $1, 'COMPROVANTE_ANEXADO', $2)`, [eventoId, usuarioId]),
    ).rejects.toThrow(/registro_acao_entidade_check/);
    expect(await um(`select count(*)::int as n from eventos.solicitacao_custo`)).toEqual(antes);

    await subir();
    expect(await um(`select count(*)::int as n from eventos.comprovante_custo`)).toEqual({ n: 0 });
    expect(await banco.comoPapel("app_eventos", INSERIR, valores("custos/depois.jpg"))).toHaveLength(1);
    expect(await banco.comoPapel("app_eventos_leitura", "select 1 from eventos.comprovante_custo")).toHaveLength(0);
  });
});
