import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Ator } from "@/core/autorizacao";
import type { Db } from "@/core/db/database";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

// A action de verdade (permissão → formulário → fluxo → guarda → banco), no modo LOCAL com o banco de teste.
const ambiente = vi.hoisted(() => ({ db: null as Db | null, porta: 0, ator: null as Ator | null }));

vi.mock("@/core/db/client", () => ({
  get db() {
    return ambiente.db;
  },
}));
vi.mock("@/core/ambiente", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  situacaoDoAmbiente: () => ({ liberada: true, modo: "LOCAL" }),
  portaDoBancoConfigurado: () => ambiente.porta,
  modoLocal: () => true,
}));
vi.mock("@/app/(time)/_servidor/usuario-atual", () => ({ obterAtor: async () => ambiente.ator }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { criarVigenciaDeRegraAcao } = await import("../acoes");
const { MENSAGEM_SEM_SESSAO } = await import("@/app/(time)/_servidor/acao");
const { MENSAGEM_ACESSO_NEGADO } = await import("@/core/autorizacao");

describe.skipIf(!TEST_DATABASE_URL)("action sem permissão não grava (Regras de custo, só a líder)", () => {
  let banco: BancoDeTeste;
  let regraId: string;
  let usuarioId: string;

  const atorCom = (...perfis: Ator["perfis"][number][]): Ator => ({ usuarioId, pessoaId: null, nome: "Teste", email: "t@exemplo.test", perfis, origem: "LOCAL" });
  const formulario = (campos: Record<string, string>) => {
    const form = new FormData();
    for (const [chave, valor] of Object.entries(campos)) form.append(chave, valor);
    return form;
  };
  const contagem = async () => {
    const [linha] = (await banco.sql(
      `select (select count(*)::int from eventos.regra_custo) as regras,
              (select count(*)::int from eventos.registro_acao where entidade = 'REGRA_CUSTO') as registros`,
    )) as [{ regras: number; registros: number }];
    return linha;
  };

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    const [{ nome }] = (await banco.sql("select current_database() as nome")) as [{ nome: string }];
    await banco.sql(`alter database ${nome} set eventos.ambiente = 'local'`);
    ambiente.db = banco.db;
    ambiente.porta = Number(new URL(TEST_DATABASE_URL!).port || 5432);
    usuarioId = ((await banco.sql(`insert into core.usuario (email) values ('lider@exemplo.test') returning id`)) as [{ id: string }])[0].id;
    regraId = ((await banco.sql(`select id from eventos.regra_custo where categoria = 'ALIMENTACAO' and ativo order by vigente_desde limit 1`)) as [{ id: string }])[0].id;
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  const valido = () => formulario({ regraId, valorCentavos: "300,00", vigenteDesde: "2027-03-01" });

  it("perfil do time: acesso negado e nada muda no banco (nem a validação do formulário roda)", async () => {
    ambiente.ator = atorCom("EVENTOS_TIME");
    const antes = await contagem();
    await expect(criarVigenciaDeRegraAcao({ ok: true }, valido())).resolves.toEqual({ ok: false, erro: MENSAGEM_ACESSO_NEGADO });
    await expect(criarVigenciaDeRegraAcao({ ok: true }, formulario({ regraId: "x" }))).resolves.toEqual({ ok: false, erro: MENSAGEM_ACESSO_NEGADO });
    expect(await contagem()).toEqual(antes);
  });

  it("sem sessão: recusa antes de tudo", async () => {
    ambiente.ator = null;
    const antes = await contagem();
    await expect(criarVigenciaDeRegraAcao({ ok: true }, valido())).resolves.toEqual({ ok: false, erro: MENSAGEM_SEM_SESSAO });
    expect(await contagem()).toEqual(antes);
  });

  it("líder: grava a vigência e o registro_acao com o usuário dela", async () => {
    ambiente.ator = atorCom("EVENTOS_LIDER");
    const antes = await contagem();
    const resultado = await criarVigenciaDeRegraAcao({ ok: true }, valido());
    expect(resultado).toMatchObject({ ok: true });
    expect(await contagem()).toEqual({ regras: antes.regras + 1, registros: antes.registros + 1 });
    const [registro] = (await banco.sql(`select usuario_id from eventos.registro_acao where entidade = 'REGRA_CUSTO' order by criado_em desc limit 1`)) as [
      { usuario_id: string },
    ];
    expect(registro.usuario_id).toBe(usuarioId);
  });
});
