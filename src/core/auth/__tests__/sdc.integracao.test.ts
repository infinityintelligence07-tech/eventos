import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { listarSdcLocais, resolverAcessoPorEmail, resolverAcessoPorId, resolverSdcPorEmail } from "../sdc";

// Quem entrou (docs/09 §15): time, SDC, os dois, desativado, e-mail desconhecido e maiúsculas, lendo o banco.
describe.skipIf(!TEST_DATABASE_URL)("acesso da SDC no banco", () => {
  let banco: BancoDeTeste;
  let liderId: string;
  let sdcId: string;
  let desativadoId: string;

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
    await naLista("rh@exemplo.test", "RH na lista");
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

  it("conta da IAM sem perfil do Eventos, se estiver na lista, é SDC; fora da lista continua sem acesso", async () => {
    expect(await resolverAcessoPorEmail("rh@exemplo.test", banco.db)).toMatchObject({ situacao: "SDC", sdc: { nome: "RH na lista" } });
    await banco.sql(`update eventos.acesso_sdc set ativo = false where email = 'rh@exemplo.test'`);
    expect(await resolverAcessoPorEmail("rh@exemplo.test", banco.db)).toEqual({ situacao: "SEM_PERFIL", email: "rh@exemplo.test" });
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
  });

  it("a lista guarda o e-mail em minúsculas e sem repetição (CHECK e UNIQUE no banco)", async () => {
    await expect(naLista("Maiuscula@exemplo.test", "Com maiúscula")).rejects.toThrow(/acesso_sdc_email_check/);
    await expect(naLista(" espaco@exemplo.test", "Com espaço")).rejects.toThrow(/acesso_sdc_email_check/);
    await expect(naLista("sem-arroba", "Sem arroba")).rejects.toThrow(/acesso_sdc_email_check/);
    await expect(naLista("atendimento.sdc@exemplo.test", "Repetido")).rejects.toThrow(/acesso_sdc_email_unique/);
  });
});
