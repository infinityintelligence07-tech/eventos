import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Auth from "@/core/auth";

import { GET } from "../route";

const supabase = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));

vi.mock("@/core/auth", async (importOriginal) => {
  const real = await importOriginal<typeof Auth>();
  return {
    ...real,
    configuracaoDoLogin: () => ({ url: "https://projeto.supabase.test", chavePublica: "publica", urlPublica: "https://eventos.iam.test", producao: true }),
    criarSupabaseDoServidor: async () => ({ auth: { exchangeCodeForSession: supabase.exchangeCodeForSession } }),
  };
});

/** O Host é do atacante de propósito: o destino nunca sai dele. */
function chamar(parametros: string) {
  return GET(new NextRequest(`https://atacante.test/auth/callback?${parametros}`));
}

describe("/auth/callback", () => {
  beforeEach(() => {
    supabase.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  });

  it("troca o código e segue para o caminho interno", async () => {
    const resposta = await chamar("code=abc&proximo=%2Fpessoas%3Fpolo%3DAM");
    expect(supabase.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(resposta.headers.get("location")).toBe("https://eventos.iam.test/pessoas?polo=AM");
  });

  it.each(["%2F%2Fexterno.com", "%2F%5Cexterno.com", "http%3A%2F%2Fexterno.com", "https%3A%2F%2Fexterno.com%2Finicio", "javascript%3Aalert(1)"])(
    "recusa o redirecionamento aberto proximo=%s",
    async (proximo) => {
      const resposta = await chamar(`code=abc&proximo=${proximo}`);
      expect(resposta.headers.get("location")).toBe("https://eventos.iam.test/inicio");
    },
  );

  it("sem código ou com código vencido volta ao login com o motivo", async () => {
    expect((await chamar("proximo=%2Fpessoas")).headers.get("location")).toBe("https://eventos.iam.test/login?erro=falhou");
    supabase.exchangeCodeForSession.mockResolvedValue({ error: new Error("expirado") });
    expect((await chamar("code=velho")).headers.get("location")).toBe("https://eventos.iam.test/login?erro=link-expirado");
  });
});
