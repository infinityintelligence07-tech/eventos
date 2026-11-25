import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ResolucaoDoAcesso } from "@/core/auth";

// A SDC não passa nas portas do time e o time não passa nas da SDC (docs/09 §15). O teste roda as portas de verdade
// (exigirAtor, obterAtor, executarAcao, exigirAtorSdc, obterAtorSdc, executarAcaoDaSdc) sobre a decisão de quem entrou;
// só a leitura do banco e o cookie são trocados.

const cena = vi.hoisted(() => ({ quem: { situacao: "SEM_CADASTRO" } as unknown }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "cookie" }) }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT ${destino}`);
  },
  unstable_rethrow: () => undefined,
}));
vi.mock("@/core/ambiente", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), modoLocal: () => true, modoDemo: () => false }));
vi.mock("@/fluxos/_base", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  bancoParaLeitura: async () => ({}),
  situacaoDaEscrita: async () => ({ liberada: true, modo: "LOCAL" }),
}));
vi.mock("@/core/auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usuarioDoCookieLocal: () => "id-do-cookie",
  resolverAcessoPorId: async () => cena.quem,
}));

const SDC: ResolucaoDoAcesso = { situacao: "SDC", sdc: { acessoSdcId: "5dc00000-0000-7000-8000-000000000001", nome: "SDC (teste)", email: "atendimento.sdc@exemplo.test", origem: "LOCAL" } };
const doTime = (perfil: "EVENTOS_TIME" | "EVENTOS_LIDER"): ResolucaoDoAcesso => ({
  situacao: "OK",
  ator: { usuarioId: "u", pessoaId: null, nome: "Do Time", email: "time@exemplo.test", perfis: [perfil], origem: "LOCAL" },
});

const { exigirAtor, obterAtor, permissoesDoAtor } = await import("@/app/(time)/_servidor/usuario-atual");
const { executarAcao, executarLeitura, MENSAGEM_SEM_SESSAO } = await import("@/app/(time)/_servidor/acao");
const { exigirAtorSdc, obterAtorSdc } = await import("../_servidor/ator-sdc");
const { executarAcaoDaSdc, MENSAGEM_SEM_ACESSO_DA_SDC } = await import("../_servidor/acao");
const { PERMISSOES } = await import("@/core/autorizacao");

const form = () => {
  const dados = new FormData();
  dados.set("campo", "valor");
  return dados;
};
const schema = z.object({ campo: z.string() });

describe("a SDC nas portas do time", () => {
  beforeEach(() => {
    cena.quem = SDC;
  });

  it("não é ator do time: obterAtor devolve nulo e exigirAtor manda para /sdc", async () => {
    expect(await obterAtor()).toBeNull();
    await expect(exigirAtor()).rejects.toThrow("REDIRECT /sdc");
    await expect(permissoesDoAtor("logistica.gerir")).rejects.toThrow("REDIRECT /sdc");
  });

  it("nenhuma action do time roda para a SDC, com nenhuma das permissões (nem leitura)", async () => {
    const trabalho = vi.fn(async () => "feito");
    for (const permissao of PERMISSOES) {
      expect(await executarAcao(form(), schema, permissao, trabalho)).toEqual({ ok: false, erro: MENSAGEM_SEM_SESSAO });
      expect(await executarLeitura(permissao, trabalho)).toEqual({ ok: false, erro: MENSAGEM_SEM_SESSAO });
    }
    expect(trabalho).not.toHaveBeenCalled();
  });

  it("na área dela, passa", async () => {
    expect(await obterAtorSdc()).toEqual(SDC.situacao === "SDC" ? SDC.sdc : null);
    expect(await exigirAtorSdc()).toMatchObject({ email: "atendimento.sdc@exemplo.test" });
    const trabalho = vi.fn(async () => "feito");
    expect(await executarAcaoDaSdc(form(), schema, trabalho)).toEqual({ ok: true, mensagem: "feito" });
    expect(trabalho).toHaveBeenCalledWith({ campo: "valor" }, SDC.situacao === "SDC" ? SDC.sdc : null);
  });
});

describe.each(["EVENTOS_TIME", "EVENTOS_LIDER"] as const)("o time (%s) nas portas da SDC", (perfil) => {
  beforeEach(() => {
    cena.quem = doTime(perfil);
  });

  it("não é ator SDC: obterAtorSdc devolve nulo e exigirAtorSdc manda para /inicio", async () => {
    expect(await obterAtor()).toMatchObject({ perfis: [perfil] });
    expect(await obterAtorSdc()).toBeNull();
    await expect(exigirAtorSdc()).rejects.toThrow("REDIRECT /inicio");
  });

  it("nenhuma action da SDC roda para o time", async () => {
    const trabalho = vi.fn(async () => "feito");
    expect(await executarAcaoDaSdc(form(), schema, trabalho)).toEqual({ ok: false, erro: MENSAGEM_SEM_ACESSO_DA_SDC });
    expect(trabalho).not.toHaveBeenCalled();
  });
});

describe("quem não é ninguém não entra em nenhuma das duas áreas", () => {
  it.each<[string, unknown, string]>([
    ["sem cadastro (e-mail desconhecido ou SDC desativada)", { situacao: "SEM_CADASTRO" }, "REDIRECT /entrar-local"],
    ["sem perfil do Eventos", { situacao: "SEM_PERFIL", email: "rh@exemplo.test" }, "REDIRECT /sem-acesso"],
  ])("%s", async (_caso, quem, destino) => {
    cena.quem = quem;
    expect(await obterAtor()).toBeNull();
    expect(await obterAtorSdc()).toBeNull();
    await expect(exigirAtor()).rejects.toThrow(destino);
    await expect(exigirAtorSdc()).rejects.toThrow(destino);
    const trabalho = vi.fn(async () => "feito");
    expect(await executarAcaoDaSdc(form(), schema, trabalho)).toEqual({ ok: false, erro: MENSAGEM_SEM_ACESSO_DA_SDC });
    expect(await executarAcao(form(), schema, "logistica.gerir", trabalho)).toEqual({ ok: false, erro: MENSAGEM_SEM_SESSAO });
    expect(trabalho).not.toHaveBeenCalled();
  });

  it("situação desconhecida falha fechada nas duas portas", async () => {
    cena.quem = { situacao: "NOVA" };
    await expect(exigirAtor()).rejects.toThrow(/desconhecida/);
    await expect(exigirAtorSdc()).rejects.toThrow(/desconhecida/);
    expect(await obterAtor()).toBeNull();
    expect(await obterAtorSdc()).toBeNull();
  });
});
