import { describe, expect, it } from "vitest";

import { destinoSeguro, enderecoAbsoluto } from "../destino";
import { usuarioDoCookieLocal } from "../local";

describe("destinoSeguro: só caminho interno depois do login", () => {
  it.each([
    ["/calendario", "/calendario"],
    ["/eventos/abc/escala?aba=1#topo", "/eventos/abc/escala?aba=1#topo"],
    ["/pessoas/%2F%2Fx", "/pessoas/%2F%2Fx"],
  ])("aceita %s", (proximo, esperado) => {
    expect(destinoSeguro(proximo)).toBe(esperado);
  });

  it.each([
    "//externo.com",
    "//externo.com/inicio",
    "/\\externo.com",
    "\\\\externo.com",
    "http://externo.com",
    "https://externo.com/inicio",
    "javascript:alert(1)",
    "/\t/externo.com",
    "/\n/externo.com",
    "externo.com",
    "",
    null,
    undefined,
    `/${"a".repeat(3000)}`,
  ])("recusa %j e vai para /inicio", (proximo) => {
    expect(destinoSeguro(proximo)).toBe("/inicio");
  });

  it("monta o endereço com a URL pública, não com o Host da requisição", () => {
    expect(enderecoAbsoluto("/pessoas", "https://eventos.iam.test", "https://atacante.test").toString()).toBe("https://eventos.iam.test/pessoas");
    expect(enderecoAbsoluto("//externo.com", "https://eventos.iam.test", "https://atacante.test").toString()).toBe("https://eventos.iam.test/inicio");
    expect(enderecoAbsoluto("/inicio", null, "http://127.0.0.1:3011").toString()).toBe("http://127.0.0.1:3011/inicio");
  });
});

describe("cookie do modo local", () => {
  it("só aceita um UUID", () => {
    expect(usuarioDoCookieLocal("7E570000-0000-7000-8000-000000000001")).toBe("7e570000-0000-7000-8000-000000000001");
    for (const valor of [undefined, null, "", "admin", "7e570000' or 1=1 --"]) expect(usuarioDoCookieLocal(valor)).toBeNull();
  });
});
