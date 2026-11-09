import { describe, expect, it, vi } from "vitest";

import { turmaDeExemplo } from "@/test/turmas";

import { conferirSenhaNoIamControl, createIamControlClient, IamControlError } from "../client";

function fetchQueResponde(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }));
}

describe("cliente do IAM Control", () => {
  it("envia o token exclusivo e os filtros, e valida a resposta", async () => {
    const fetch = fetchQueResponde(200, { a_partir_de: "2026-09-26", ate: null, total: 1, turmas: [turmaDeExemplo({ edicao: 60 as unknown as string })] });
    const cliente = createIamControlClient({ baseUrl: "https://iam.test/", token: "tok", fetch });

    const resposta = await cliente.listarTurmas({ aPartirDe: "2026-09-26" });

    expect(resposta.turmas[0]?.edicao).toBe("60");
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://iam.test/api/webhooks/eventos/turmas?a_partir_de=2026-09-26");
    expect((init.headers as Record<string, string>)["x-webhook-token"]).toBe("tok");
  });

  it("explica token recusado, erro do servidor e formato inesperado", async () => {
    const com = (fetch: typeof globalThis.fetch) => createIamControlClient({ baseUrl: "https://iam.test", token: "t", fetch });

    await expect(com(fetchQueResponde(401, {})).listarTurmas()).rejects.toThrow(/IAM_CONTROL_EVENTOS_TOKEN/);
    await expect(com(fetchQueResponde(500, {})).listarTurmas()).rejects.toMatchObject({ status: 500 });
    await expect(com(fetchQueResponde(200, { turmas: [{ id: "x" }] })).listarTurmas()).rejects.toThrow(
      /fora do formato/,
    );
    const caiu = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(com(caiu).listarTurmas()).rejects.toBeInstanceOf(IamControlError);
  });

  it("lê os colaboradores com o mesmo token e valida a resposta", async () => {
    const colaborador = {
      id: 2,
      nome: "Ana",
      email: "ana@exemplo.test",
      telefone: null,
      cidade: null,
      estado: null,
      setores: ["EVENTOS"],
      funcoes: ["STAFF"],
      ativo: true,
      atualizado_em: "2026-11-09T12:00:00Z",
      excluido_em: null,
    };
    const fetch = fetchQueResponde(200, { total: 1, colaboradores: [colaborador] });
    const cliente = createIamControlClient({ baseUrl: "https://iam.test", token: "tok", fetch });

    await expect(cliente.listarColaboradores()).resolves.toEqual({ total: 1, colaboradores: [colaborador] });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://iam.test/api/webhooks/eventos/colaboradores");
    expect((init.headers as Record<string, string>)["x-webhook-token"]).toBe("tok");

    const semCampo = createIamControlClient({ baseUrl: "https://iam.test", token: "t", fetch: fetchQueResponde(200, { total: 1, colaboradores: [{ id: 2 }] }) });
    await expect(semCampo.listarColaboradores()).rejects.toThrow(/fora do formato/);
  });

  it("confere a senha no login do IAM Control, sem token, e só aceita resposta com o usuário", async () => {
    const fetch = fetchQueResponde(201, { success: true, token: "jwt-do-iam", user: { id: 1, email: "Ana@Exemplo.test" } });
    await expect(conferirSenhaNoIamControl({ baseUrl: "https://iam.test/", fetch }, "ana@exemplo.test", "segredo")).resolves.toEqual({
      ok: true,
      email: "ana@exemplo.test",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://iam.test/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@exemplo.test", senha: "segredo", provider: "credentials" });
    expect(init.headers).not.toHaveProperty("x-webhook-token");

    const com = (status: number, corpo: unknown = {}) => conferirSenhaNoIamControl({ baseUrl: "https://iam.test", fetch: fetchQueResponde(status, corpo) }, "a@b.c", "x");
    for (const status of [400, 401, 403]) await expect(com(status)).resolves.toEqual({ ok: false });
    await expect(com(500)).rejects.toBeInstanceOf(IamControlError);
    await expect(com(200, { success: true })).rejects.toThrow(/fora do formato/);
  });
});
