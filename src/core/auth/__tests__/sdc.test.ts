import { describe, expect, it } from "vitest";

import type { ResolucaoDoAtor } from "../ator";
import { type AtorSdc, decidirAcessoDaSdc, decidirQuemEntrou, normalizarEmail, sessaoAutenticadaPeloGoogle, type UsuarioDoProvedor } from "../sdc";

const LINHA = { id: "5dc00000-0000-7000-8000-000000000001", email: "atendimento.sdc@exemplo.test", nome: "SDC (teste)", ativo: true };
const SDC: AtorSdc = { acessoSdcId: LINHA.id, nome: "SDC (teste)", email: LINHA.email, origem: "SESSAO" };

describe("decidirAcessoDaSdc: quem é a SDC (fail-closed)", () => {
  it("linha ativa da lista vira ator SDC, com a origem do login", () => {
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "atendimento.sdc@exemplo.test")).toEqual(SDC);
    expect(decidirAcessoDaSdc(LINHA, "LOCAL")).toEqual({ ...SDC, origem: "LOCAL" });
  });

  it("e-mail da sessão em maiúsculas ou com espaços é o mesmo e-mail", () => {
    expect(normalizarEmail("  Atendimento.SDC@Exemplo.TEST ")).toBe("atendimento.sdc@exemplo.test");
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "  Atendimento.SDC@Exemplo.TEST ")).toEqual(SDC);
  });

  it("sem linha, desativada ou com e-mail que não bate: não é SDC", () => {
    expect(decidirAcessoDaSdc(null, "SESSAO", LINHA.email)).toBeNull();
    expect(decidirAcessoDaSdc(undefined, "SESSAO", LINHA.email)).toBeNull();
    expect(decidirAcessoDaSdc({ ...LINHA, ativo: false }, "SESSAO", LINHA.email)).toBeNull();
    expect(decidirAcessoDaSdc({ ...LINHA, ativo: false }, "LOCAL")).toBeNull();
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "outra.pessoa@exemplo.test")).toBeNull();
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "atendimento.sdc@exemplo.test.br")).toBeNull();
    // ativo precisa ser exatamente true (valor estranho vindo do banco não abre a porta).
    expect(decidirAcessoDaSdc({ ...LINHA, ativo: "t" as unknown as boolean }, "SESSAO", LINHA.email)).toBeNull();
  });
});

describe("decidirQuemEntrou: o time vem primeiro e gente da IAM nunca é SDC", () => {
  const doTime: ResolucaoDoAtor = {
    situacao: "OK",
    ator: { usuarioId: "u", pessoaId: null, nome: "Time A", email: "time.a@exemplo.test", perfis: ["EVENTOS_TIME"], origem: "SESSAO" },
  };
  const semPerfil: ResolucaoDoAtor = { situacao: "SEM_PERFIL", email: "x@exemplo.test" };

  it("quem é do time continua sendo do time mesmo com o e-mail na lista da SDC", () => {
    for (const ehDaIam of [true, false]) expect(decidirQuemEntrou(doTime, ehDaIam, SDC)).toBe(doTime);
    expect(decidirQuemEntrou(doTime, true, null)).toBe(doTime);
  });

  it("só quem NÃO existe na IAM e está ativo na lista é SDC", () => {
    expect(decidirQuemEntrou({ situacao: "SEM_CADASTRO" }, false, SDC)).toEqual({ situacao: "SDC", sdc: SDC });
    expect(decidirQuemEntrou({ situacao: "SEM_CADASTRO" }, false, null)).toEqual({ situacao: "SEM_CADASTRO" });
  });

  it("e-mail que existe em core.usuario nunca vira SDC: sem perfil ou inativo continua sem acesso", () => {
    // Conta da IAM sem perfil do Eventos (ou que perdeu o perfil).
    expect(decidirQuemEntrou(semPerfil, true, SDC)).toBe(semPerfil);
    // Mesmo que alguém diga que não é da IAM, SEM_PERFIL só existe para quem tem core.usuario: não vira SDC.
    expect(decidirQuemEntrou(semPerfil, false, SDC)).toBe(semPerfil);
    // Conta da IAM inativa ou apagada (o time resolve como SEM_CADASTRO, mas o e-mail existe).
    expect(decidirQuemEntrou({ situacao: "SEM_CADASTRO" }, true, SDC)).toEqual({ situacao: "SEM_CADASTRO" });
    // Valor estranho no lugar do booleano não abre a porta.
    expect(decidirQuemEntrou({ situacao: "SEM_CADASTRO" }, undefined as unknown as boolean, SDC)).toEqual({ situacao: "SEM_CADASTRO" });
  });
});

describe("sessaoAutenticadaPeloGoogle: o ator SDC exige login pelo Google nesta sessão (fail-closed)", () => {
  const usuario: UsuarioDoProvedor = {
    id: "a0000000-0000-4000-8000-000000000001",
    email: "Atendimento.SDC@exemplo.test",
    email_confirmed_at: "2026-11-25T12:00:00Z",
    is_anonymous: false,
    identities: [{ provider: "google", identity_data: { email: "atendimento.sdc@exemplo.test", email_verified: true } }],
  };
  const claims = { sub: usuario.id, amr: [{ method: "oauth", timestamp: 1795600000 }] };

  it("identidade google com o mesmo e-mail + sessão nascida de oauth: passa (também com amr em texto e depois de renovar o token)", () => {
    expect(sessaoAutenticadaPeloGoogle(usuario, claims)).toBe(true);
    expect(sessaoAutenticadaPeloGoogle(usuario, { sub: usuario.id, amr: ["oauth"] })).toBe(true);
    expect(sessaoAutenticadaPeloGoogle(usuario, { sub: usuario.id, amr: [{ method: "oauth" }, { method: "token_refresh" }] })).toBe(true);
  });

  it.each<[string, UsuarioDoProvedor | null, unknown]>([
    ["sem usuário", null, claims],
    ["sem claims", usuario, null],
    ["claims de outro usuário", usuario, { ...claims, sub: "outro" }],
    ["sem amr", usuario, { sub: usuario.id }],
    ["amr vazio", usuario, { sub: usuario.id, amr: [] }],
    ["amr que não é lista", usuario, { sub: usuario.id, amr: "oauth" }],
    ["sessão por senha", usuario, { sub: usuario.id, amr: [{ method: "password" }] }],
    ["sessão por código ou link do e-mail", usuario, { sub: usuario.id, amr: [{ method: "otp" }] }],
    ["link mágico", usuario, { sub: usuario.id, amr: ["magiclink"] }],
    ["senha junto de oauth", usuario, { sub: usuario.id, amr: [{ method: "oauth" }, { method: "password" }] }],
    ["anônima", usuario, { sub: usuario.id, amr: [{ method: "anonymous" }] }],
    ["só renovação, sem dizer como entrou", usuario, { sub: usuario.id, amr: [{ method: "token_refresh" }] }],
    ["entrada do amr sem método", usuario, { sub: usuario.id, amr: [{ method: "oauth" }, {}] }],
    ["usuário anônimo", { ...usuario, is_anonymous: true }, claims],
    ["e-mail não confirmado", { ...usuario, email_confirmed_at: null }, claims],
    ["sem e-mail", { ...usuario, email: null }, claims],
    ["sem identidades", { ...usuario, identities: null }, claims],
    ["só identidade de e-mail e senha", { ...usuario, identities: [{ provider: "email", identity_data: { email: "atendimento.sdc@exemplo.test" } }] }, claims],
    ["identidade de outro provedor", { ...usuario, identities: [{ provider: "github", identity_data: { email: "atendimento.sdc@exemplo.test" } }] }, claims],
    ["identidade google de outro e-mail", { ...usuario, identities: [{ provider: "google", identity_data: { email: "outra@exemplo.test" } }] }, claims],
    ["identidade google sem e-mail", { ...usuario, identities: [{ provider: "google", identity_data: {} }] }, claims],
    ["identidade google com e-mail não verificado", { ...usuario, identities: [{ provider: "google", identity_data: { email: "atendimento.sdc@exemplo.test", email_verified: false } }] }, claims],
  ])("%s: não passa", (_caso, quem, dasClaims) => {
    expect(sessaoAutenticadaPeloGoogle(quem, dasClaims as never)).toBe(false);
  });
});
