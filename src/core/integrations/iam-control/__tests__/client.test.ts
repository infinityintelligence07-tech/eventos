import { describe, expect, it, vi } from "vitest";

import { turmaDeExemplo } from "@/test/turmas";

import { createIamControlClient, IamControlError } from "../client";

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
});
