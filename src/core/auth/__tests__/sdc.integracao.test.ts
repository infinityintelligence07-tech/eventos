import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { emailEhDaIam, listarSdcLocais, resolverAcessoPorEmail as resolver, resolverAcessoPorId, resolverSdcPorEmail } from "../sdc";

// Quem entrou (docs/09 §15): time, SDC, os dois, desativado, e-mail desconhecido e maiúsculas, lendo o banco.
describe.skipIf(!TEST_DATABASE_URL)("acesso da SDC no banco", () => {
  let banco: BancoDeTeste;
  let liderId: string;
  let sdcId: string;
  let desativadoId: string;

  // Sessão autenticada pelo Google (o padrão dos casos); os testes do fim trocam por "não foi pelo Google".
  const peloGoogle = { pelaContaGoogle: async () => true };
  const resolverAcessoPorEmail = (email: string, db: BancoDeTeste["db"], opcoes = peloGoogle) => resolver(email, db, opcoes);
  let rhNaListaId: string;
  let inativoNaListaId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;
  const naLista = async (email: string, nome: string, ativo = true) => (await um(`insert into eventos.acesso_sdc (email, nome, ativo) values ($1, $2, $3) returning id`, [email, nome, ativo])).id!;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await banco.sql(`insert into core.perfil (codigo, nome) values ('EVENTOS_TIME', 'Time de eventos'), ('EVENTOS_LIDER', 'Líder'), ('CEO', 'CEO') on conflict (codigo) do nothing`);
    liderId = (await um(`insert into core.usuario (email, nome_usuario, ativo) values ('lider@exemplo.test', 'lider', true) returning id`)).id!;
    await banco.sql(`insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = 'EVENTOS_LIDER'`, [liderId]);
    // Conta da IAM sem perfil do Eventos (ex.: alguém do GH).
    const semPerfil = (await um(`insert into core.usuario (email, nome_usuario, ativo) values ('rh@exemplo.test', 'rh', true) returning id`)).id!;
    await banco.sql(`insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = 'CEO'`, [semPerfil]);

    sdcId = await naLista("atendimento.sdc@exemplo.test", "SDC (teste)");
    desativadoId = await naLista("saiu.da.sdc@exemplo.test", "Saiu da SDC", false);
    // A líder também está na lista da SDC (por engano): continua sendo do time.
    await naLista("lider@exemplo.test", "Líder na lista");
    // Postos direto no banco (a tela recusa): contas da IAM sem perfil do Eventos e inativa, com o e-mail na lista.
    rhNaListaId = await naLista("rh@exemplo.test", "RH na lista");
    await banco.sql(`insert into core.usuario (email, nome_usuario, ativo) values ('Saiu.Da.IAM@exemplo.test', 'saiu', false)`);
    inativoNaListaId = await naLista("saiu.da.iam@exemplo.test", "Saiu da IAM");
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("e-mail ativo na lista, que não é do time, entra como SDC (sem nada no cadastro do GH)", async () => {
    expect(await resolverAcessoPorEmail("atendimento.sdc@exemplo.test", banco.db)).toEqual({
      situacao: "SDC",
      sdc: { acessoSdcId: sdcId, nome: "SDC (teste)", email: "atendimento.sdc@exemplo.test", origem: "SESSAO" },
    });
    expect(await banco.sql(`select 1 from core.usuario where lower(email) = 'atendimento.sdc@exemplo.test'`)).toEqual([]);
  });

  it("o e-mail do provedor é comparado sem diferenciar maiúsculas nem espaços", async () => {
    expect(await resolverAcessoPorEmail("  Atendimento.SDC@Exemplo.TEST ", banco.db)).toMatchObject({ situacao: "SDC", sdc: { acessoSdcId: sdcId } });
  });

  it("quem é do time continua sendo do time mesmo com o e-mail na lista da SDC", async () => {
    expect(await resolverAcessoPorEmail("lider@exemplo.test", banco.db)).toMatchObject({ situacao: "OK", ator: { usuarioId: liderId, perfis: ["EVENTOS_LIDER"] } });
    // A lista, sozinha, diria que é SDC: quem decide é a ordem (time primeiro).
    expect(await resolverSdcPorEmail("lider@exemplo.test", banco.db)).not.toBeNull();
  });

  it("e-mail que existe em core.usuario NUNCA é SDC: sem perfil continua sem acesso e inativo continua sem cadastro", async () => {
    expect(await emailEhDaIam(" RH@exemplo.test ", banco.db)).toBe(true);
    expect(await emailEhDaIam("saiu.da.iam@exemplo.test", banco.db)).toBe(true);
    expect(await emailEhDaIam("atendimento.sdc@exemplo.test", banco.db)).toBe(false);
    // A lista, sozinha, diria que são SDC.
    expect(await resolverSdcPorEmail("rh@exemplo.test", banco.db)).not.toBeNull();
    expect(await resolverSdcPorEmail("saiu.da.iam@exemplo.test", banco.db)).not.toBeNull();
    expect(await resolverAcessoPorEmail("rh@exemplo.test", banco.db)).toEqual({ situacao: "SEM_PERFIL", email: "rh@exemplo.test" });
    expect(await resolverAcessoPorEmail("saiu.da.iam@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    // No modo local (id da linha da lista) vale a mesma regra, e o "Entrar como" nem oferece essas linhas.
    expect(await resolverAcessoPorId(rhNaListaId, banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorId(inativoNaListaId, banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    const locais = (await listarSdcLocais(banco.db)).map((linha) => linha.email);
    expect(locais).toEqual(["atendimento.sdc@exemplo.test"]);
  });

  it("quem perde o perfil do Eventos não vira SDC (mesmo com o e-mail na lista)", async () => {
    await banco.sql(`delete from core.usuario_perfil where usuario_id = $1`, [liderId]);
    expect(await resolverAcessoPorEmail("lider@exemplo.test", banco.db)).toEqual({ situacao: "SEM_PERFIL", email: "lider@exemplo.test" });
    await banco.sql(`update core.usuario set ativo = false where id = $1`, [liderId]);
    expect(await resolverAcessoPorEmail("lider@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    await banco.sql(`update core.usuario set ativo = true where id = $1`, [liderId]);
    await banco.sql(`insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = 'EVENTOS_LIDER'`, [liderId]);
  });

  it("o ator SDC exige sessão autenticada pelo Google; o time não passa por essa pergunta", async () => {
    const naoFoi = { pelaContaGoogle: vi.fn(async () => false) };
    expect(await resolverAcessoPorEmail("atendimento.sdc@exemplo.test", banco.db, naoFoi)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(naoFoi.pelaContaGoogle).toHaveBeenCalledTimes(1);
    // Resposta que não é exatamente `true` não abre a porta.
    expect(await resolverAcessoPorEmail("atendimento.sdc@exemplo.test", banco.db, { pelaContaGoogle: async () => "sim" as unknown as boolean })).toEqual({ situacao: "SEM_CADASTRO" });
    await expect(resolverAcessoPorEmail("atendimento.sdc@exemplo.test", banco.db, { pelaContaGoogle: async () => Promise.reject(new Error("fora")) })).rejects.toThrow("fora");

    // Time, gente da IAM e e-mail fora da lista: a pergunta nem é feita (o comportamento do time não muda nesta rodada).
    const espia = { pelaContaGoogle: vi.fn(async () => false) };
    expect(await resolverAcessoPorEmail("lider@exemplo.test", banco.db, espia)).toMatchObject({ situacao: "OK" });
    expect(await resolverAcessoPorEmail("rh@exemplo.test", banco.db, espia)).toMatchObject({ situacao: "SEM_PERFIL" });
    expect(await resolverAcessoPorEmail("ninguem@exemplo.test", banco.db, espia)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorEmail("saiu.da.sdc@exemplo.test", banco.db, espia)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(espia.pelaContaGoogle).not.toHaveBeenCalled();
  });

  it("e-mail desativado ou desconhecido não entra (e parecido não é igual)", async () => {
    expect(await resolverAcessoPorEmail("saiu.da.sdc@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorEmail("ninguem@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorEmail("atendimento.sdc@exemplo.test.br", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorEmail("%@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorEmail("", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
  });

  it("desativar corta o acesso na leitura seguinte; reativar devolve", async () => {
    await banco.sql(`update eventos.acesso_sdc set ativo = false where id = $1`, [sdcId]);
    expect(await resolverAcessoPorEmail("atendimento.sdc@exemplo.test", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorId(sdcId, banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    await banco.sql(`update eventos.acesso_sdc set ativo = true where id = $1`, [sdcId]);
    expect(await resolverAcessoPorEmail("atendimento.sdc@exemplo.test", banco.db)).toMatchObject({ situacao: "SDC" });
  });

  it("modo local: o id do cookie é de um usuário do time ou de uma linha ativa da lista", async () => {
    expect(await resolverAcessoPorId(sdcId, banco.db)).toEqual({
      situacao: "SDC",
      sdc: { acessoSdcId: sdcId, nome: "SDC (teste)", email: "atendimento.sdc@exemplo.test", origem: "LOCAL" },
    });
    expect(await resolverAcessoPorId(liderId, banco.db)).toMatchObject({ situacao: "OK", ator: { origem: "LOCAL" } });
    expect(await resolverAcessoPorId(desativadoId, banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await resolverAcessoPorId("7e570000-0000-7000-8000-00000000ffff", banco.db)).toEqual({ situacao: "SEM_CADASTRO" });
    expect((await listarSdcLocais(banco.db)).map((linha) => linha.email)).not.toContain("saiu.da.sdc@exemplo.test");
    expect((await listarSdcLocais(banco.db)).map((linha) => linha.email)).not.toContain("lider@exemplo.test");
  });

  it("a lista guarda o e-mail em minúsculas e sem repetição (CHECK e UNIQUE no banco)", async () => {
    await expect(naLista("Maiuscula@exemplo.test", "Com maiúscula")).rejects.toThrow(/acesso_sdc_email_check/);
    await expect(naLista(" espaco@exemplo.test", "Com espaço")).rejects.toThrow(/acesso_sdc_email_check/);
    await expect(naLista("sem-arroba", "Sem arroba")).rejects.toThrow(/acesso_sdc_email_check/);
    await expect(naLista("atendimento.sdc@exemplo.test", "Repetido")).rejects.toThrow(/acesso_sdc_email_unique/);
  });
});
