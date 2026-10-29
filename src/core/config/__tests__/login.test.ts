import { describe, expect, it } from "vitest";

import { cabecalhosDeSeguranca, origensDasServerActions, parseEnvironment } from "../leitura";

const BASE = { DATABASE_URL: "postgresql://postgres@localhost:55432/eventos_local" };
const LOGIN = {
  NEXT_PUBLIC_SUPABASE_URL: "https://projeto.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-publica",
  EVENTOS_URL_PUBLICA: "https://eventos.iam.test",
};

describe("variáveis do login", () => {
  it("são opcionais no modo local e em desenvolvimento", () => {
    const local = parseEnvironment({ ...BASE, NODE_ENV: "development", EVENTOS_MODO: "local" });
    expect([local.NEXT_PUBLIC_SUPABASE_URL, local.NEXT_PUBLIC_SUPABASE_ANON_KEY, local.EVENTOS_URL_PUBLICA]).toEqual([undefined, undefined, undefined]);
    expect(parseEnvironment({ ...BASE, NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "" }).NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  });

  it("são obrigatórias em produção", () => {
    expect(() => parseEnvironment({ ...BASE, NODE_ENV: "production" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_ANON_KEY.*EVENTOS_URL_PUBLICA/,
    );
    expect(parseEnvironment({ ...BASE, ...LOGIN, NODE_ENV: "production" })).toMatchObject(LOGIN);
  });

  it("são opcionais na demo sem login, também em produção", () => {
    const demo = parseEnvironment({ ...BASE, NODE_ENV: "production", EVENTOS_MODO: "demo" });
    expect(demo.EVENTOS_MODO).toBe("demo");
    expect(() => parseEnvironment({ ...BASE, NODE_ENV: "production", EVENTOS_MODO: "outro" })).toThrow(/EVENTOS_MODO/);
  });

  it("URLs precisam ser válidas", () => {
    expect(() => parseEnvironment({ ...BASE, NODE_ENV: "development", EVENTOS_URL_PUBLICA: "eventos" })).toThrow(/EVENTOS_URL_PUBLICA/);
  });
});

describe("cabeçalhos e origens das server actions (next.config.ts)", () => {
  it("anti-iframe e referrer em todo ambiente; HSTS só em produção", () => {
    const local = Object.fromEntries(cabecalhosDeSeguranca(false).map(({ key, value }) => [key, value]));
    expect(local).toEqual({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
    });
    const producao = Object.fromEntries(cabecalhosDeSeguranca(true).map(({ key, value }) => [key, value]));
    expect(producao["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
  });

  it("origens vêm só do host da URL pública", () => {
    expect(origensDasServerActions("https://eventos.iam.test")).toEqual(["eventos.iam.test"]);
    expect(origensDasServerActions("https://eventos.iam.test:8443/caminho?x=1")).toEqual(["eventos.iam.test:8443"]);
    for (const valor of [undefined, "", "eventos", "javascript:alert(1)", "ftp://eventos.iam.test"]) expect(origensDasServerActions(valor)).toEqual([]);
  });
});
