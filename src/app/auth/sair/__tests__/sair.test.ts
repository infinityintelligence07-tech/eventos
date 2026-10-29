import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Auth from "@/core/auth";

import * as rota from "../route";

const sessao = vi.hoisted(() => ({ signOut: vi.fn(), apagarCookie: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ delete: sessao.apagarCookie }) }));
vi.mock("@/core/auth", async (importOriginal) => {
  const real = await importOriginal<typeof Auth>();
  return {
    ...real,
    configuracaoDoLogin: () => ({ url: "https://projeto.supabase.test", chavePublica: "publica", urlPublica: "https://eventos.iam.test", producao: true }),
    criarSupabaseDoServidor: async () => ({ auth: { signOut: sessao.signOut } }),
  };
});

function post(origem: string | null, corpo: Record<string, string> = {}) {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (origem) headers.set("sec-fetch-site", origem);
  return rota.POST(new NextRequest("https://atacante.test/auth/sair", { method: "POST", headers, body: new URLSearchParams(corpo).toString() }));
}

describe("/auth/sair", () => {
  beforeEach(() => {
    sessao.signOut.mockReset();
    sessao.apagarCookie.mockReset();
  });

  it("só existe por POST (GET não desloga)", () => {
    expect(Object.keys(rota)).toEqual(["POST"]);
  });

  it("POST do próprio site encerra a sessão e volta ao login com o motivo (303)", async () => {
    const resposta = await post("same-origin", { motivo: "sem-cadastro" });
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get("location")).toBe("https://eventos.iam.test/login?erro=sem-cadastro");
    expect(sessao.signOut).toHaveBeenCalledOnce();
    expect(sessao.apagarCookie).toHaveBeenCalledWith("eventos_ator_local");
  });

  it("motivo fora da lista não vai para a URL", async () => {
    const resposta = await post("same-origin", { motivo: "<script>" });
    expect(resposta.headers.get("location")).toBe("https://eventos.iam.test/login");
  });

  it.each(["cross-site", "same-site", "none"])("POST com Sec-Fetch-Site %s é recusado sem encerrar nada", async (origem) => {
    const resposta = await post(origem);
    expect(resposta.status).toBe(403);
    expect(sessao.signOut).not.toHaveBeenCalled();
    expect(sessao.apagarCookie).not.toHaveBeenCalled();
  });
});
