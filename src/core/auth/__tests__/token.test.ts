import { describe, expect, it } from "vitest";

import { tokenDeChaveAssimetrica } from "../token";

const parte = (dado: unknown) => Buffer.from(JSON.stringify(dado)).toString("base64url");
const token = (cabecalho: unknown) => `${parte(cabecalho)}.${parte({ sub: "alguem" })}.assinatura`;

describe("tokenDeChaveAssimetrica: dá para conferir a assinatura sem ir ao Supabase Auth?", () => {
  it.each(["ES256", "RS256", "EdDSA"])("%s com kid: sim", (alg) => {
    expect(tokenDeChaveAssimetrica(token({ alg, typ: "JWT", kid: "chave-1" }))).toBe(true);
  });

  it.each<[string, unknown]>([
    ["segredo simétrico (HS256), o padrão antigo do Supabase", { alg: "HS256", typ: "JWT" }],
    ["HS256 mesmo com kid", { alg: "HS256", typ: "JWT", kid: "chave-1" }],
    ["HS512", { alg: "HS512", kid: "chave-1" }],
    ["assimétrico sem kid (a biblioteca não saberia qual chave usar)", { alg: "ES256", typ: "JWT" }],
    ["kid vazio", { alg: "ES256", kid: "" }],
    ["kid que não é texto", { alg: "ES256", kid: 1 }],
    ["sem algoritmo", { typ: "JWT", kid: "chave-1" }],
    ["algoritmo none", { alg: "none", kid: "chave-1" }],
    ["algoritmo None", { alg: "None", kid: "chave-1" }],
    ["cabeçalho que não é objeto", "ES256"],
    ["cabeçalho nulo", null],
  ])("%s: não", (_caso, cabecalho) => {
    expect(tokenDeChaveAssimetrica(token(cabecalho))).toBe(false);
  });

  it.each(["", "abc", "a.b", "a.b.c.d", "!!!.e30.x", `${Buffer.from("não é json").toString("base64url")}.e30.x`])("texto que não é um token (%j): não", (texto) => {
    expect(tokenDeChaveAssimetrica(texto)).toBe(false);
  });

  it("lê base64url sem preenchimento e com os caracteres - e _", () => {
    // Um kid com caracteres que viram - e _ em base64url.
    const cabecalho = { alg: "ES256", kid: "~~~???>>>" };
    expect(parte(cabecalho)).toMatch(/[-_]/);
    expect(tokenDeChaveAssimetrica(token(cabecalho))).toBe(true);
  });
});
