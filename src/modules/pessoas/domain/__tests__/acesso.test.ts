import { describe, expect, it } from "vitest";

import {
  acaoDoHistorico,
  definirAcessoSchema,
  MENSAGEM_PROPRIO_ACESSO,
  MENSAGEM_USUARIO_INATIVO,
  MENSAGEM_USUARIO_SUMIU,
  motivoParaNaoAlterar,
  nivelDosPerfis,
  perfisDoNivel,
} from "../acesso";

describe("acesso do time", () => {
  it("o nível sai dos perfis: líder vence, perfil de outro sistema não conta", () => {
    expect(nivelDosPerfis(["EVENTOS_TIME", "EVENTOS_LIDER"])).toBe("LIDER");
    expect(nivelDosPerfis(["EVENTOS_LIDER"])).toBe("LIDER");
    expect(nivelDosPerfis(["EVENTOS_TIME"])).toBe("TIME");
    expect(nivelDosPerfis(["GH_ADMIN"])).toBe("SEM_ACESSO");
    expect(nivelDosPerfis([])).toBe("SEM_ACESSO");
  });

  it("a líder recebe os dois perfis; ida e volta dá o mesmo nível", () => {
    expect(perfisDoNivel("LIDER")).toEqual(["EVENTOS_LIDER", "EVENTOS_TIME"]);
    expect(perfisDoNivel("TIME")).toEqual(["EVENTOS_TIME"]);
    expect(perfisDoNivel("SEM_ACESSO")).toEqual([]);
    for (const nivel of ["LIDER", "TIME", "SEM_ACESSO"] as const) expect(nivelDosPerfis(perfisDoNivel(nivel))).toBe(nivel);
  });

  it("ninguém altera o próprio acesso, nem para subir nem para sair", () => {
    const eu = { usuarioId: "u-1", ativo: true, nivel: "LIDER" as const };
    expect(motivoParaNaoAlterar("u-1", eu, "SEM_ACESSO")).toBe(MENSAGEM_PROPRIO_ACESSO);
    expect(motivoParaNaoAlterar("u-1", eu, "TIME")).toBe(MENSAGEM_PROPRIO_ACESSO);
    expect(motivoParaNaoAlterar("u-1", { ...eu, nivel: "TIME" }, "LIDER")).toBe(MENSAGEM_PROPRIO_ACESSO);
  });

  it("conta inativa não recebe acesso, mas pode perder; conta que sumiu avisa", () => {
    const inativa = { usuarioId: "u-2", ativo: false, nivel: "TIME" as const };
    expect(motivoParaNaoAlterar("u-1", inativa, "LIDER")).toBe(MENSAGEM_USUARIO_INATIVO);
    expect(motivoParaNaoAlterar("u-1", inativa, "SEM_ACESSO")).toBeNull();
    expect(motivoParaNaoAlterar("u-1", { ...inativa, ativo: true }, "LIDER")).toBeNull();
    expect(motivoParaNaoAlterar("u-1", null, "TIME")).toBe(MENSAGEM_USUARIO_SUMIU);
  });

  it("o histórico diz se concedeu, alterou ou retirou", () => {
    expect(acaoDoHistorico("SEM_ACESSO", "TIME")).toBe("ACESSO_CONCEDIDO");
    expect(acaoDoHistorico("TIME", "LIDER")).toBe("ACESSO_ALTERADO");
    expect(acaoDoHistorico("LIDER", "SEM_ACESSO")).toBe("ACESSO_RETIRADO");
  });

  it("o formulário só aceita os três níveis e um id válido", () => {
    expect(definirAcessoSchema.safeParse({ usuarioId: "01a1c56e-dd51-788d-8050-adbb9b7efa92", nivel: "LIDER" }).success).toBe(true);
    expect(definirAcessoSchema.safeParse({ usuarioId: "01a1c56e-dd51-788d-8050-adbb9b7efa92", nivel: "ADMIN" }).success).toBe(false);
    expect(definirAcessoSchema.safeParse({ usuarioId: "abc", nivel: "TIME" }).success).toBe(false);
  });
});
