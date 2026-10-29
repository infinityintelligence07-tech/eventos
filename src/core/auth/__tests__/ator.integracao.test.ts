import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { listarUsuariosLocais, resolverAtorPorEmail, resolverAtorPorId } from "../ator";

describe.skipIf(!TEST_DATABASE_URL)("ator no banco", () => {
  let banco: BancoDeTeste;
  let lider: string;
  let semPerfil: string;
  let inativo: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;

  async function usuario(email: string, { ativo = true, perfis = [] as [string, string][], nome = null as string | null } = {}): Promise<string> {
    const { id } = await um(`insert into core.usuario (email, nome_usuario, ativo) values ($1, split_part($1, '@', 1), $2) returning id`, [email, ativo]);
    if (nome) await banco.sql(`insert into core.pessoa (usuario_id, nome_completo) values ($1, $2)`, [id, nome]);
    for (const [codigo, escopo] of perfis) {
      await banco.sql(
        `insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, $3 from core.perfil where codigo = $2`,
        [id, codigo, escopo],
      );
    }
    return id!;
  }

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await banco.sql(
      `insert into core.perfil (codigo, nome) values ('EVENTOS_TIME', 'Time de eventos'), ('EVENTOS_LIDER', 'Líder'), ('CEO', 'CEO')
       on conflict (codigo) do nothing`,
    );
    lider = await usuario("Lider@Exemplo.test", { nome: "Líder (teste)", perfis: [["EVENTOS_LIDER", "GLOBAL"], ["CEO", "GLOBAL"]] });
    semPerfil = await usuario("ceo@exemplo.test", { perfis: [["CEO", "GLOBAL"], ["EVENTOS_TIME", "POLO"]] });
    inativo = await usuario("saiu@exemplo.test", { ativo: false, perfis: [["EVENTOS_TIME", "GLOBAL"]] });
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("e-mail do Google comparado sem diferenciar maiúsculas", async () => {
    expect(await resolverAtorPorEmail(" lider@exemplo.TEST ", banco.db)).toMatchObject({
      situacao: "OK",
      ator: { usuarioId: lider, nome: "Líder (teste)", email: "Lider@Exemplo.test", perfis: ["EVENTOS_LIDER"], origem: "SESSAO" },
    });
  });

  it("sem perfil GLOBAL do Eventos → SEM_PERFIL; inativo ou desconhecido → SEM_CADASTRO", async () => {
    expect(await resolverAtorPorEmail("ceo@exemplo.test", banco.db)).toEqual({ situacao: "SEM_PERFIL", email: "ceo@exemplo.test" });
    expect(await resolverAtorPorEmail("saiu@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAtorPorEmail("ninguem@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
  });

  it("modo local resolve pelo id com as mesmas regras", async () => {
    expect(await resolverAtorPorId(lider, banco.db)).toMatchObject({ situacao: "OK", ator: { origem: "LOCAL", perfis: ["EVENTOS_LIDER"] } });
    expect(await resolverAtorPorId(semPerfil, banco.db)).toMatchObject({ situacao: "SEM_PERFIL" });
    expect(await resolverAtorPorId(inativo, banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAtorPorId("7e570000-0000-7000-8000-00000000ffff", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
  });

  it("o seletor local lista só usuários ativos, com os perfis GLOBAL do Eventos", async () => {
    const lista = await listarUsuariosLocais(banco.db);
    expect(lista.map((item) => [item.email, item.perfis])).toEqual([
      ["Lider@Exemplo.test", ["EVENTOS_LIDER"]],
      ["ceo@exemplo.test", []],
    ]);
  });
});
