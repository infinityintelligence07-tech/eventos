import { describe, expect, it } from "vitest";

import { assinarSessao, DURACAO_DA_SESSAO_EM_SEGUNDOS, lerSessao } from "../sessao-propria";
import { criarLimiteDeTentativas } from "../limite-de-tentativas";

const SEGREDO = "s".repeat(32);
const agora = new Date("2026-11-09T12:00:00Z");

describe("sessão do login com senha", () => {
  it("lê o e-mail (em minúsculas) de um cookie assinado e válido", () => {
    expect(lerSessao(assinarSessao(" Ana@Exemplo.test ", SEGREDO, agora), SEGREDO, agora)).toBe("ana@exemplo.test");
  });

  it("vence depois de 8 horas", () => {
    const cookie = assinarSessao("ana@exemplo.test", SEGREDO, agora);
    const quase = new Date(agora.getTime() + (DURACAO_DA_SESSAO_EM_SEGUNDOS - 1) * 1000);
    const depois = new Date(agora.getTime() + DURACAO_DA_SESSAO_EM_SEGUNDOS * 1000);
    expect(lerSessao(cookie, SEGREDO, quase)).toBe("ana@exemplo.test");
    expect(lerSessao(cookie, SEGREDO, depois)).toBeNull();
  });

  it("recusa outro segredo, conteúdo trocado e lixo", () => {
    const cookie = assinarSessao("ana@exemplo.test", SEGREDO, agora);
    expect(lerSessao(cookie, "o".repeat(32), agora)).toBeNull();
    const [, assinatura] = cookie.split(".");
    const forjado = Buffer.from(JSON.stringify({ email: "lider@exemplo.test", exp: 9_999_999_999 })).toString("base64url");
    expect(lerSessao(`${forjado}.${assinatura}`, SEGREDO, agora)).toBeNull();
    for (const lixo of [undefined, "", "abc", "a.b.c", `${cookie}.x`]) expect(lerSessao(lixo, SEGREDO, agora)).toBeNull();
  });
});

describe("limite de tentativas", () => {
  it("bloqueia no máximo de falhas dentro da janela e libera depois", () => {
    const limite = criarLimiteDeTentativas(3, 60_000);
    for (let i = 0; i < 3; i += 1) {
      expect(limite.bloqueado("ana", agora)).toBe(false);
      limite.registrarFalha("ana", agora);
    }
    expect(limite.bloqueado("ana", agora)).toBe(true);
    expect(limite.bloqueado("outra", agora)).toBe(false);
    expect(limite.bloqueado("ana", new Date(agora.getTime() + 60_000))).toBe(false);
  });

  it("limpar zera as falhas da chave", () => {
    const limite = criarLimiteDeTentativas(1, 60_000);
    limite.registrarFalha("ana", agora);
    limite.limpar("ana");
    expect(limite.bloqueado("ana", agora)).toBe(false);
  });
});
