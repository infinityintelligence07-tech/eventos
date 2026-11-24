import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarArmazenamentoS3 } from "../armazenamento";
import { assinarRequisicao, sha256Hex, urlPreAssinada } from "../sigv4";

// O que os testes com fetch falso não pegam: se o que sai de verdade pela rede (cabeçalhos que o fetch do Node
// acrescenta ou reescreve, host com porta, corpo binário) ainda bate com a assinatura. Um servidor S3 de mentira,
// neste processo, confere cada pedido como um S3 confere: refaz a assinatura com o que RECEBEU e compara.

const credenciais = { chaveId: "chave-de-teste", segredo: "segredo-de-teste" };
const regiao = "sa-east-1";
const bucket = "eventos-comprovantes";
const CHAVE = "custos/0192f0c0-0000-7000-8000-000000000001/7f1f2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.jpg";

type Recebido = { metodo: string; caminho: string; motivoDaRecusa: string | null };

const instanteDoAmz = (amz: string) => new Date(amz.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));

async function corpoDe(pedido: IncomingMessage): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of pedido) partes.push(parte as Buffer);
  return Buffer.concat(partes);
}

/** Nulo = assinatura confere. */
function conferir(pedido: IncomingMessage, corpo: Buffer, origem: string): string | null {
  const url = new URL(pedido.url ?? "/", origem);
  const cabecalho = (nome: string) => String(pedido.headers[nome] ?? "");

  if (url.searchParams.has("X-Amz-Signature")) {
    const semAssinatura = new URL(url.href);
    for (const nome of [...semAssinatura.searchParams.keys()]) if (nome.startsWith("X-Amz-")) semAssinatura.searchParams.delete(nome);
    const esperada = urlPreAssinada({
      url: semAssinatura.href,
      expiraEmSegundos: Number(url.searchParams.get("X-Amz-Expires")),
      credenciais,
      regiao,
      instante: instanteDoAmz(url.searchParams.get("X-Amz-Date") ?? ""),
    });
    return esperada === url.href ? null : "URL pré-assinada não confere";
  }

  const autorizacao = cabecalho("authorization");
  const assinados = /SignedHeaders=([^,]+),/.exec(autorizacao)?.[1]?.split(";") ?? [];
  if (!assinados.includes("host")) return "host fora da assinatura";
  if (cabecalho("x-amz-content-sha256") !== sha256Hex(corpo)) return "x-amz-content-sha256 diferente do corpo recebido";
  const extras = Object.fromEntries(assinados.filter((nome) => !["host", "x-amz-date", "x-amz-content-sha256"].includes(nome)).map((nome) => [nome, cabecalho(nome)]));
  const esperado = assinarRequisicao({
    metodo: pedido.method as "GET" | "PUT" | "DELETE",
    // O host é o que chegou no cabeçalho Host (com a porta), como um S3 de verdade usa.
    url: `http://${cabecalho("host")}${pedido.url}`,
    cabecalhos: extras,
    corpoSha256: cabecalho("x-amz-content-sha256"),
    credenciais,
    regiao,
    instante: instanteDoAmz(cabecalho("x-amz-date")),
  });
  return esperado.Authorization === autorizacao ? null : "assinatura não confere";
}

describe("armazenamento S3 pela rede (servidor S3 de mentira, assinatura conferida no recebimento)", () => {
  let servidor: Server;
  let origem: string;
  const objetos = new Map<string, { conteudo: Buffer; tipo: string }>();
  const recebidos: Recebido[] = [];

  beforeAll(async () => {
    servidor = createServer((pedido, resposta) => {
      void corpoDe(pedido).then((corpo) => {
        const caminho = new URL(pedido.url ?? "/", origem).pathname;
        const motivoDaRecusa = conferir(pedido, corpo, origem);
        recebidos.push({ metodo: pedido.method ?? "", caminho, motivoDaRecusa });
        if (motivoDaRecusa) return resposta.writeHead(403).end("<Error><Code>SignatureDoesNotMatch</Code></Error>");
        if (pedido.method === "PUT") {
          objetos.set(caminho, { conteudo: corpo, tipo: String(pedido.headers["content-type"]) });
          return resposta.writeHead(200).end();
        }
        const objeto = objetos.get(caminho);
        if (pedido.method === "DELETE") {
          objetos.delete(caminho);
          return resposta.writeHead(204).end();
        }
        if (!objeto) return resposta.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
        return resposta.writeHead(200, { "content-type": objeto.tipo }).end(objeto.conteudo);
      });
    });
    await new Promise<void>((resolver) => servidor.listen(0, "127.0.0.1", resolver));
    origem = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolver) => servidor.close(resolver));
  });

  it("grava, lê, abre pela URL pré-assinada, apaga e some: tudo com a assinatura aceita", async () => {
    const s3 = criarArmazenamentoS3({ endpoint: `${origem}/storage/v1/s3`, regiao, bucket, credenciais });
    // Binário de propósito, com bytes que não são texto válido.
    const conteudo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const caminho = `/storage/v1/s3/${bucket}/${CHAVE}`;

    await s3.guardar(CHAVE, conteudo, "image/jpeg");
    expect(objetos.get(caminho)).toEqual({ conteudo: Buffer.from(conteudo), tipo: "image/jpeg" });
    expect(await s3.ler(CHAVE)).toEqual(conteudo);

    const link = (await s3.linkTemporario(CHAVE, 60))!;
    const peloLink = await fetch(link);
    expect(peloLink.status).toBe(200);
    expect(new Uint8Array(await peloLink.arrayBuffer())).toEqual(conteudo);
    // Mexer em qualquer parte do link invalida a assinatura; sem assinatura nenhuma, também não abre.
    expect((await fetch(link.replace("X-Amz-Expires=60", "X-Amz-Expires=600"))).status).toBe(403);
    expect((await fetch(link.replace(".jpg", ".png"))).status).toBe(403);
    expect((await fetch(link.split("?")[0]!)).status).toBe(403);

    await s3.apagar(CHAVE);
    expect(await s3.ler(CHAVE)).toBeNull();
    await s3.apagar(CHAVE);

    const aceitos = recebidos.filter((pedido) => pedido.motivoDaRecusa === null).map((pedido) => pedido.metodo);
    expect(aceitos).toEqual(["PUT", "GET", "GET", "DELETE", "GET", "DELETE"]);
    expect(recebidos.filter((pedido) => pedido.motivoDaRecusa !== null)).toHaveLength(3);
  });

  it("com o segredo errado o servidor recusa e o erro não traz endereço nem credencial", async () => {
    const errado = criarArmazenamentoS3({ endpoint: `${origem}/storage/v1/s3`, regiao, bucket, credenciais: { ...credenciais, segredo: "outro-segredo" } });
    const erro = await errado.guardar(CHAVE, new Uint8Array([1, 2, 3]), "image/jpeg").catch((falha: unknown) => falha);
    expect(erro).toMatchObject({ name: "ArmazenamentoError", operacao: "guardar", status: 403 });
    expect(`${String(erro)} ${JSON.stringify(erro)}`).not.toMatch(/127\.0\.0\.1|outro-segredo|chave-de-teste/);
  });
});
