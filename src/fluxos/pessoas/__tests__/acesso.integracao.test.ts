import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { MENSAGEM_PROPRIO_ACESSO } from "@/modules/pessoas";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { definirAcessoDoTime, listarAcessoDoTime } from "../acesso";

const banco = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    situacaoDaEscrita: async () => ({ liberada: true }),
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(banco.db!, trabalho as never),
  };
});

// Configurações › Acesso do time (migration 0012). Tudo roda com o papel app_eventos, o mesmo do site.
describe.skipIf(!TEST_DATABASE_URL)("acesso do time no banco", () => {
  let teste: BancoDeTeste;
  let app: ReturnType<BancoDeTeste["dbComoPapel"]>;
  let lider: string;
  let doTime: string;
  let novato: string;
  let inativo: string;
  const NEGADO = /permission denied/;

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, string>[])[0]!;
  const usuario = async (email: string, nome: string, ativo = true) =>
    (await um(`insert into core.usuario (email, nome_usuario, ativo) values ($1, $2, $3) returning id`, [email, nome, ativo])).id!;
  const dar = (usuarioId: string, ...codigos: string[]) =>
    teste.sql(
      `insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = any($2::text[])`,
      [usuarioId, codigos],
    );
  const perfisDe = async (usuarioId: string) =>
    ((await teste.sql(
      `select pf.codigo from core.usuario_perfil up join core.perfil pf on pf.id = up.perfil_id where up.usuario_id = $1 order by pf.codigo`,
      [usuarioId],
    )) as { codigo: string }[]).map((linha) => linha.codigo);
  const ator = (usuarioId: string) => ({ usuarioId, pessoaId: null, origem: "SESSAO" as const });

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    app = teste.dbComoPapel("app_eventos");
    banco.db = app.db;
    await teste.sql(`insert into core.perfil (codigo, nome) values ('GH_ADMIN', 'GH: administrador')`);
    lider = await usuario("lider@exemplo.test", "Lia Líder");
    doTime = await usuario("time@exemplo.test", "Tito Time");
    novato = await usuario("novata@exemplo.test", "Nina Novata");
    inativo = await usuario("saiu@exemplo.test", "Ivo Inativo", false);
    await dar(lider, "EVENTOS_LIDER", "EVENTOS_TIME");
    await dar(doTime, "EVENTOS_TIME");
    await dar(inativo, "EVENTOS_TIME");
    await dar(novato, "GH_ADMIN");
  }, 60_000);

  afterAll(async () => {
    await app?.encerrar();
    await teste?.encerrar();
  });

  it("o app não escreve direto em core.usuario_perfil: só pela função", async () => {
    await expect(
      teste.comoPapel("app_eventos", `insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = 'EVENTOS_LIDER'`, [novato]),
    ).rejects.toThrow(NEGADO);
    await expect(teste.comoPapel("app_eventos", `delete from core.usuario_perfil where usuario_id = $1`, [doTime])).rejects.toThrow(NEGADO);
  });

  it("a função recusa perfil de outro sistema, quem não é líder, o próprio acesso e os outros papéis", async () => {
    const chamar = (papel: "app_eventos" | "app_eventos_leitura" | "app_eventos_worker", quem: string, alvo: string, perfis: string) =>
      teste.comoPapel(papel, `select eventos.definir_perfis_do_eventos($1::uuid, $2::uuid, ${perfis})`, [quem, alvo]);
    await expect(chamar("app_eventos", lider, novato, `array['GH_ADMIN']`)).rejects.toThrow(/perfil fora do Eventos/);
    await expect(chamar("app_eventos", doTime, novato, `array['EVENTOS_TIME']`)).rejects.toThrow(/só a líder/);
    await expect(chamar("app_eventos", novato, doTime, `array[]::text[]`)).rejects.toThrow(/só a líder/);
    await expect(chamar("app_eventos", lider, lider, `array['EVENTOS_TIME']`)).rejects.toThrow(/próprio acesso/);
    await expect(chamar("app_eventos_leitura", lider, novato, `array['EVENTOS_TIME']`)).rejects.toThrow(NEGADO);
    await expect(chamar("app_eventos_worker", lider, novato, `array['EVENTOS_TIME']`)).rejects.toThrow(NEGADO);
    expect(await perfisDe(novato)).toEqual(["GH_ADMIN"]);
  });

  it("a lista mostra quem tem acesso (líder primeiro) e a busca acha conta ativa sem acesso", async () => {
    const tela = await listarAcessoDoTime("nina");
    expect(tela.comAcesso.map((pessoa) => [pessoa.nome, pessoa.nivel, pessoa.ativo])).toEqual([
      ["Lia Líder", "LIDER", true],
      ["Ivo Inativo", "TIME", false],
      ["Tito Time", "TIME", true],
    ]);
    expect(tela.encontrados?.map((pessoa) => pessoa.email)).toEqual(["novata@exemplo.test"]);
    expect((await listarAcessoDoTime("n")).encontrados).toBeNull();
    // Quem já tem acesso não aparece na busca; % digitado não vira curinga.
    expect((await listarAcessoDoTime("tito")).encontrados).toEqual([]);
    expect((await listarAcessoDoTime("%%")).encontrados).toEqual([]);
  });

  it("libera, muda e retira, com histórico e sem tocar em perfil de outro sistema", async () => {
    expect(await definirAcessoDoTime({ usuarioId: novato, nivel: "TIME" }, ator(lider))).toEqual({ de: "SEM_ACESSO", para: "TIME" });
    expect(await perfisDe(novato)).toEqual(["EVENTOS_TIME", "GH_ADMIN"]);
    expect(await definirAcessoDoTime({ usuarioId: novato, nivel: "LIDER" }, ator(lider))).toEqual({ de: "TIME", para: "LIDER" });
    expect(await perfisDe(novato)).toEqual(["EVENTOS_LIDER", "EVENTOS_TIME", "GH_ADMIN"]);
    expect(await definirAcessoDoTime({ usuarioId: novato, nivel: "SEM_ACESSO" }, ator(lider))).toEqual({ de: "LIDER", para: "SEM_ACESSO" });
    expect(await perfisDe(novato)).toEqual(["GH_ADMIN"]);

    const historico = (await teste.sql(
      `select acao, dados, usuario_id from eventos.registro_acao where entidade = 'CONFIGURACAO' and entidade_id = $1 order by criado_em, id`,
      [novato],
    )) as { acao: string; dados: unknown; usuario_id: string }[];
    expect(historico.map((linha) => [linha.acao, linha.dados, linha.usuario_id])).toEqual([
      ["ACESSO_CONCEDIDO", { de: "SEM_ACESSO", para: "TIME" }, lider],
      ["ACESSO_ALTERADO", { de: "TIME", para: "LIDER" }, lider],
      ["ACESSO_RETIRADO", { de: "LIDER", para: "SEM_ACESSO" }, lider],
    ]);
  });

  it("recusa o próprio acesso, o mesmo nível de novo e conta inativa; retirar de inativa passa", async () => {
    await expect(definirAcessoDoTime({ usuarioId: lider, nivel: "TIME" }, ator(lider))).rejects.toThrow(MENSAGEM_PROPRIO_ACESSO);
    await expect(definirAcessoDoTime({ usuarioId: doTime, nivel: "TIME" }, ator(lider))).rejects.toThrow(RegraDeNegocioError);
    await expect(definirAcessoDoTime({ usuarioId: inativo, nivel: "LIDER" }, ator(lider))).rejects.toThrow(/inativa/);
    expect(await perfisDe(inativo)).toEqual(["EVENTOS_TIME"]);
    expect(await definirAcessoDoTime({ usuarioId: inativo, nivel: "SEM_ACESSO" }, ator(lider))).toEqual({ de: "TIME", para: "SEM_ACESSO" });
    expect(await perfisDe(inativo)).toEqual([]);
    expect(await perfisDe(lider)).toEqual(["EVENTOS_LIDER", "EVENTOS_TIME"]);
  });

  it("quem não é líder não altera nem chamando o fluxo direto", async () => {
    // A recusa vem do banco (a permissão do app é conferida antes, em executarAcao): a tela mostra a falha genérica.
    await expect(definirAcessoDoTime({ usuarioId: novato, nivel: "LIDER" }, ator(doTime))).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/só a líder/) },
    });
    expect(await perfisDe(novato)).toEqual(["GH_ADMIN"]);
  });
});
