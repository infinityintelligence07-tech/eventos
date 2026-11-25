import { beforeEach, describe, expect, it, vi } from "vitest";

// O caminho do login real (docs/09 §15.2): situacaoDoAtor só deixa alguém ser SDC quando ESTA sessão do Supabase foi
// autenticada pelo Google. Aqui roda a função de verdade com um Supabase de mentira; o banco é trocado por uma lista.

const cena = vi.hoisted(() => ({
  usuario: null as Record<string, unknown> | null,
  claims: null as { data: unknown; error: unknown } | null,
  getClaims: null as null | (() => Promise<unknown>),
  chamadasDeClaims: 0,
}));

const SDC = { acessoSdcId: "5dc00000-0000-7000-8000-000000000001", nome: "SDC (teste)", email: "atendimento.sdc@exemplo.test", origem: "SESSAO" as const };

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/core/ambiente", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), modoLocal: () => false, modoDemo: () => false }));
vi.mock("@/fluxos/_base", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), bancoParaLeitura: async () => ({}) }));
vi.mock("@/core/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/auth")>();
  return {
    ...original,
    segredoDaSessao: () => null,
    criarSupabaseDoServidor: async () => ({
      auth: {
        getUser: async () => ({ data: { user: cena.usuario }, error: null }),
        getClaims: async () => {
          cena.chamadasDeClaims += 1;
          if (cena.getClaims) return cena.getClaims();
          return cena.claims;
        },
      },
    }),
    // A decisão de verdade (sessaoAutenticadaPeloGoogle) roda; só a leitura do banco vira esta lista: o e-mail da SDC
    // está ativo na lista e não existe na IAM.
    resolverAcessoPorEmail: async (email: string, _executor: unknown, { pelaContaGoogle }: { pelaContaGoogle: () => Promise<boolean> }) =>
      original.normalizarEmail(email) === SDC.email && (await pelaContaGoogle()) === true ? { situacao: "SDC", sdc: SDC } : { situacao: "SEM_CADASTRO" },
  };
});

const { situacaoDoAtor, obterAtor } = await import("@/app/(time)/_servidor/usuario-atual");
const { obterAtorSdc } = await import("../_servidor/ator-sdc");

const ID = "a0000000-0000-4000-8000-000000000001";
const doGoogle = { id: ID, email: SDC.email, email_confirmed_at: "2026-11-25T12:00:00Z", is_anonymous: false, identities: [{ provider: "google", identity_data: { email: SDC.email, email_verified: true } }] };
const claimsDe = (...metodos: string[]) => ({ data: { claims: { sub: ID, amr: metodos.map((method) => ({ method, timestamp: 1 })) } }, error: null });

describe("login real: só sessão autenticada pelo Google vira ator SDC", () => {
  beforeEach(() => {
    cena.usuario = doGoogle;
    cena.claims = claimsDe("oauth");
    cena.getClaims = null;
    cena.chamadasDeClaims = 0;
  });

  it("conta Google com o e-mail da lista, sessão por oauth: é SDC (e não é ator do time)", async () => {
    expect(await situacaoDoAtor()).toEqual({ situacao: "SDC", sdc: SDC });
    expect(await obterAtorSdc()).toEqual(SDC);
    expect(await obterAtor()).toBeNull();
  });

  it.each<[string, () => void]>([
    ["usuário criado por e-mail e senha com o e-mail da lista", () => ((cena.usuario = { ...doGoogle, identities: [{ provider: "email", identity_data: { email: SDC.email } }] }), (cena.claims = claimsDe("password")))],
    ["conta com identidade google, mas esta sessão entrou por senha", () => (cena.claims = claimsDe("password"))],
    ["sessão por código enviado ao e-mail", () => (cena.claims = claimsDe("otp"))],
    ["usuário anônimo", () => ((cena.usuario = { ...doGoogle, is_anonymous: true }), (cena.claims = claimsDe("anonymous")))],
    ["identidade google de outro e-mail (troca de e-mail)", () => (cena.usuario = { ...doGoogle, identities: [{ provider: "google", identity_data: { email: "outra@exemplo.test" } }] })],
    ["getUser sem identidades", () => (cena.usuario = { id: ID, email: SDC.email, email_confirmed_at: "2026-11-25T12:00:00Z" })],
    ["token sem amr", () => (cena.claims = { data: { claims: { sub: ID } }, error: null })],
    ["token de outro usuário", () => (cena.claims = { data: { claims: { sub: "outro", amr: [{ method: "oauth" }] } }, error: null })],
    ["getClaims devolve erro", () => (cena.claims = { data: null, error: new Error("token inválido") })],
    ["getClaims devolve nada", () => (cena.claims = { data: null, error: null })],
    ["getClaims lança", () => (cena.getClaims = async () => Promise.reject(new Error("rede")))],
  ])("%s: não é SDC", async (_caso, preparar) => {
    preparar();
    expect(await situacaoDoAtor()).toEqual({ situacao: "SEM_CADASTRO" });
    expect(await obterAtorSdc()).toBeNull();
  });

  it("e-mail não confirmado nem chega a consultar as listas", async () => {
    cena.usuario = { ...doGoogle, email_confirmed_at: null };
    expect(await situacaoDoAtor()).toEqual({ situacao: "SEM_CADASTRO" });
    expect(cena.chamadasDeClaims).toBe(0);
  });
});
