import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ArmazenamentoError, criarArmazenamentoEmDisco, criarArmazenamentoEmMemoria, criarArmazenamentoS3 } from "../armazenamento";
import { sha256Hex } from "../sigv4";

const CHAVE = "custos/0192f0c0-0000-7000-8000-000000000001/7f1f2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.pdf";
const CONTEUDO = new Uint8Array(Buffer.from("%PDF-1.7 recibo"));
const CHAVES_RUINS = ["../fora.txt", "/absoluta.txt", "custos/../../fora.txt", "custos//duplo.txt", "Custos/Maiuscula.txt", "custos/com espaco.txt", "custos/a\\b.txt", ""];

describe("armazenamento em memória", () => {
  it("guarda, lê, não tem link e apaga", async () => {
    const memoria = criarArmazenamentoEmMemoria();
    await memoria.guardar(CHAVE, CONTEUDO, "application/pdf");
    expect(await memoria.ler(CHAVE)).toEqual(CONTEUDO);
    expect(await memoria.linkTemporario(CHAVE, 60)).toBeNull();
    await memoria.apagar(CHAVE);
    await memoria.apagar(CHAVE);
    expect(await memoria.ler(CHAVE)).toBeNull();
  });

  it("recusa chave fora do padrão", async () => {
    const memoria = criarArmazenamentoEmMemoria();
    for (const ruim of CHAVES_RUINS) await expect(memoria.guardar(ruim, CONTEUDO, "application/pdf")).rejects.toThrow("chave de arquivo inválida");
  });
});

describe("armazenamento em disco (modo local)", () => {
  const pastas: string[] = [];
  const novaPasta = async () => {
    const pasta = await mkdtemp(path.join(os.tmpdir(), "eventos-comprovantes-"));
    pastas.push(pasta);
    return pasta;
  };
  afterAll(async () => {
    await Promise.all(pastas.map((pasta) => rm(pasta, { recursive: true, force: true })));
  });

  it("guarda dentro da pasta (criando as subpastas), lê, não tem link e apaga", async () => {
    const pasta = await novaPasta();
    const disco = criarArmazenamentoEmDisco(pasta);
    await disco.guardar(CHAVE, CONTEUDO, "application/pdf");
    expect(await readdir(path.join(pasta, "custos", "0192f0c0-0000-7000-8000-000000000001"))).toEqual(["7f1f2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.pdf"]);
    expect(await disco.ler(CHAVE)).toEqual(CONTEUDO);
    expect(await disco.linkTemporario(CHAVE, 60)).toBeNull();
    await disco.apagar(CHAVE);
    await disco.apagar(CHAVE);
    expect(await disco.ler(CHAVE)).toBeNull();
  });

  it("nunca escreve nem lê fora da pasta", async () => {
    const pasta = await novaPasta();
    const disco = criarArmazenamentoEmDisco(pasta);
    for (const ruim of CHAVES_RUINS) {
      await expect(disco.guardar(ruim, CONTEUDO, "application/pdf")).rejects.toThrow("chave de arquivo inválida");
      await expect(disco.ler(ruim)).rejects.toThrow("chave de arquivo inválida");
      await expect(disco.apagar(ruim)).rejects.toThrow("chave de arquivo inválida");
    }
    expect(await readdir(pasta)).toEqual([]);
  });
});

describe("armazenamento S3 (Storage do Supabase)", () => {
  const SEGREDO = "segredo-que-nao-pode-vazar";
  const configuracao = {
    endpoint: "https://projeto.storage.supabase.co/storage/v1/s3/",
    regiao: "sa-east-1",
    bucket: "eventos-comprovantes",
    credenciais: { chaveId: "chave-de-teste", segredo: SEGREDO },
  };
  const agora = () => new Date("2026-12-19T15:00:00Z");
  const URL_DO_OBJETO = `https://projeto.storage.supabase.co/storage/v1/s3/eventos-comprovantes/${CHAVE}`;

  type Pedido = { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: unknown };
  function comRespostas(...respostas: (Response | Error)[]) {
    const pedidos: Pedido[] = [];
    const buscar = (async (url: RequestInfo | URL, opcoes?: RequestInit) => {
      pedidos.push({ url: String(url), metodo: opcoes?.method ?? "GET", cabecalhos: opcoes?.headers as Record<string, string>, corpo: opcoes?.body });
      const resposta = respostas.shift() ?? new Response(null, { status: 200 });
      if (resposta instanceof Error) throw resposta;
      return resposta;
    }) as typeof fetch;
    return { s3: criarArmazenamentoS3(configuracao, { fetch: buscar, agora }), pedidos };
  }

  it("guardar: PUT no estilo de caminho, com o tipo e o SHA-256 do corpo assinados", async () => {
    const { s3, pedidos } = comRespostas(new Response(null, { status: 200 }));
    await s3.guardar(CHAVE, CONTEUDO, "application/pdf");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ url: URL_DO_OBJETO, metodo: "PUT", corpo: CONTEUDO });
    expect(pedidos[0]!.cabecalhos).toMatchObject({ "content-type": "application/pdf", "x-amz-content-sha256": sha256Hex(CONTEUDO), "x-amz-date": "20261219T150000Z" });
    expect(pedidos[0]!.cabecalhos.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=chave-de-teste\/20261219\/sa-east-1\/s3\/aws4_request,SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,Signature=[0-9a-f]{64}$/,
    );
  });

  it("ler: devolve o conteúdo; 404 é 'não existe'", async () => {
    const { s3, pedidos } = comRespostas(new Response(CONTEUDO, { status: 200 }), new Response("<Error/>", { status: 404 }));
    expect(await s3.ler(CHAVE)).toEqual(CONTEUDO);
    expect(await s3.ler(CHAVE)).toBeNull();
    expect(pedidos.map((pedido) => [pedido.metodo, pedido.url])).toEqual([["GET", URL_DO_OBJETO], ["GET", URL_DO_OBJETO]]);
  });

  it("apagar: DELETE; apagar o que não existe não é erro", async () => {
    const { s3, pedidos } = comRespostas(new Response(null, { status: 204 }), new Response(null, { status: 404 }));
    await s3.apagar(CHAVE);
    await s3.apagar(CHAVE);
    expect(pedidos.map((pedido) => pedido.metodo)).toEqual(["DELETE", "DELETE"]);
  });

  it("link temporário: URL pré-assinada do objeto, sem pedir nada à rede", async () => {
    const { s3, pedidos } = comRespostas();
    const link = new URL((await s3.linkTemporario(CHAVE, 300))!);
    expect(link.origin + link.pathname).toBe(URL_DO_OBJETO);
    expect(link.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(link.searchParams.get("X-Amz-Credential")).toBe("chave-de-teste/20261219/sa-east-1/s3/aws4_request");
    expect(link.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(pedidos).toHaveLength(0);
  });

  it("falha do armazenamento vira erro sem endereço, sem credencial e sem o corpo da resposta", async () => {
    const { s3 } = comRespostas(
      new Response(`<Error><Message>SignatureDoesNotMatch ${SEGREDO}</Message></Error>`, { status: 403 }),
      new Error(`connect ECONNREFUSED ${URL_DO_OBJETO}?X-Amz-Signature=abc`),
      new Response(null, { status: 500 }),
    );
    const recusado = await s3.guardar(CHAVE, CONTEUDO, "application/pdf").catch((erro: unknown) => erro);
    expect(recusado).toBeInstanceOf(ArmazenamentoError);
    expect(recusado).toMatchObject({ operacao: "guardar", status: 403, message: "armazenamento: falha ao guardar (HTTP 403)" });
    const semRede = await s3.ler(CHAVE).catch((erro: unknown) => erro);
    expect(semRede).toMatchObject({ operacao: "ler", status: null, message: "armazenamento: falha ao ler" });
    await expect(s3.apagar(CHAVE)).rejects.toMatchObject({ operacao: "apagar", status: 500 });
    for (const erro of [recusado, semRede]) {
      const tudo = `${String(erro)} ${JSON.stringify(erro)} ${(erro as Error).stack ?? ""} ${String((erro as Error).cause ?? "")}`;
      expect(tudo).not.toContain(SEGREDO);
      expect(tudo).not.toContain("supabase.co");
      expect(tudo).not.toContain("X-Amz-Signature");
    }
  });

  it("recusa chave fora do padrão antes de falar com a rede", async () => {
    const { s3, pedidos } = comRespostas();
    for (const ruim of CHAVES_RUINS) {
      await expect(s3.guardar(ruim, CONTEUDO, "application/pdf")).rejects.toThrow("chave de arquivo inválida");
      await expect(s3.linkTemporario(ruim, 60)).rejects.toThrow("chave de arquivo inválida");
    }
    expect(pedidos).toHaveLength(0);
  });
});
