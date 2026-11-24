import { describe, expect, it } from "vitest";

import { assinarRequisicao, CORPO_NAO_ASSINADO, instanteAmz, pedidoCanonico, sha256Hex, textoParaAssinar, urlPreAssinada } from "../sigv4";

// Exemplos da documentação do S3 ("Signature Calculations for the Authorization Header" e "Authenticating Requests:
// Using Query Parameters"): credenciais de exemplo da AWS, bucket examplebucket, us-east-1, 24/05/2013 00:00:00 UTC.
const credenciais = { chaveId: "AKIAIOSFODNN7EXAMPLE", segredo: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
const regiao = "us-east-1";
const instante = new Date("2013-05-24T00:00:00Z");
const VAZIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const assinaturaDe = (cabecalhos: Record<string, string>) => /Signature=([0-9a-f]{64})$/.exec(cabecalhos.Authorization ?? "")?.[1];

describe("AWS Signature V4 (exemplos da documentação do S3)", () => {
  it("SHA-256 do corpo vazio e do corpo do exemplo de PUT", () => {
    expect(sha256Hex("")).toBe(VAZIO);
    expect(sha256Hex("Welcome to Amazon S3.")).toBe("44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
    expect(instanteAmz(instante)).toBe("20130524T000000Z");
  });

  it("GET Object com Range: pedido canônico, texto para assinar e assinatura", () => {
    const url = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const canonico = pedidoCanonico({
      metodo: "GET",
      url,
      consulta: [],
      cabecalhos: { host: url.host, range: "bytes=0-9", "x-amz-content-sha256": VAZIO, "x-amz-date": "20130524T000000Z" },
      corpoSha256: VAZIO,
    });
    expect(canonico.texto).toBe(
      ["GET", "/test.txt", "", "host:examplebucket.s3.amazonaws.com", "range:bytes=0-9", `x-amz-content-sha256:${VAZIO}`, "x-amz-date:20130524T000000Z", "", "host;range;x-amz-content-sha256;x-amz-date", VAZIO].join("\n"),
    );
    expect(textoParaAssinar(canonico.texto, "20130524T000000Z", regiao)).toBe(
      ["AWS4-HMAC-SHA256", "20130524T000000Z", "20130524/us-east-1/s3/aws4_request", "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972"].join("\n"),
    );

    const cabecalhos = assinarRequisicao({ metodo: "GET", url: url.href, cabecalhos: { Range: "bytes=0-9" }, corpoSha256: VAZIO, credenciais, regiao, instante });
    expect(cabecalhos.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    expect(cabecalhos).toMatchObject({ Range: "bytes=0-9", "x-amz-content-sha256": VAZIO, "x-amz-date": "20130524T000000Z" });
  });

  it("PUT Object: o nome com $ é codificado no caminho e os cabeçalhos extras entram na assinatura", () => {
    const cabecalhos = assinarRequisicao({
      metodo: "PUT",
      url: "https://examplebucket.s3.amazonaws.com/test$file.text",
      cabecalhos: { Date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
      corpoSha256: sha256Hex("Welcome to Amazon S3."),
      credenciais,
      regiao,
      instante,
    });
    expect(cabecalhos.Authorization).toContain("SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class,");
    expect(assinaturaDe(cabecalhos)).toBe("98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
  });

  it("parâmetros na URL entram em ordem, com valor vazio (GET Bucket Lifecycle e List Objects)", () => {
    const lifecycle = assinarRequisicao({ metodo: "GET", url: "https://examplebucket.s3.amazonaws.com/?lifecycle", corpoSha256: VAZIO, credenciais, regiao, instante });
    expect(assinaturaDe(lifecycle)).toBe("fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543");

    const lista = assinarRequisicao({ metodo: "GET", url: "https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2", corpoSha256: VAZIO, credenciais, regiao, instante });
    expect(assinaturaDe(lista)).toBe("34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");
  });

  it("URL pré-assinada de GET com validade de 24 horas", () => {
    expect(urlPreAssinada({ url: "https://examplebucket.s3.amazonaws.com/test.txt", expiraEmSegundos: 86400, credenciais, regiao, instante })).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });
});

describe("AWS Signature V4 no estilo de caminho (endpoint S3 do Supabase)", () => {
  const supabase = { chaveId: "chave-de-teste", segredo: "segredo-de-teste" };
  const objeto = "https://projeto.storage.supabase.co/storage/v1/s3/eventos-comprovantes/eventos/0192f0c0/arquivo.pdf";
  const agora = new Date("2026-12-19T15:04:05.678Z");

  it("o caminho inteiro (prefixo do endpoint, bucket e chave) entra no pedido canônico e o host é o do endpoint", () => {
    const url = new URL(objeto);
    const { texto } = pedidoCanonico({ metodo: "PUT", url, consulta: [], cabecalhos: { host: url.host }, corpoSha256: CORPO_NAO_ASSINADO });
    expect(texto.split("\n").slice(0, 4)).toEqual(["PUT", "/storage/v1/s3/eventos-comprovantes/eventos/0192f0c0/arquivo.pdf", "", "host:projeto.storage.supabase.co"]);
  });

  it("é determinística e muda com o método, o objeto, o corpo, o instante e o segredo", () => {
    const base = { metodo: "PUT" as const, url: objeto, cabecalhos: { "content-type": "application/pdf" }, corpoSha256: sha256Hex("a"), credenciais: supabase, regiao: "sa-east-1", instante: agora };
    const assinar = (mudanca: Partial<typeof base> = {}) => assinaturaDe(assinarRequisicao({ ...base, ...mudanca }));
    expect(assinar()).toBe(assinar());
    const variacoes = [
      assinar({ url: `${objeto}x` }),
      assinar({ corpoSha256: sha256Hex("b") }),
      assinar({ instante: new Date("2026-12-19T15:04:06Z") }),
      assinar({ credenciais: { ...supabase, segredo: "outro" } }),
      assinar({ regiao: "us-east-1" }),
      assinar({ cabecalhos: { "content-type": "image/png" } }),
    ];
    expect(new Set([assinar(), ...variacoes]).size).toBe(variacoes.length + 1);
    expect(assinarRequisicao(base)["x-amz-date"]).toBe("20261219T150405Z");
    expect(assinarRequisicao(base).Authorization).toContain("Credential=chave-de-teste/20261219/sa-east-1/s3/aws4_request,SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,");
  });

  it("a URL pré-assinada leva a validade e a credencial, nunca o segredo", () => {
    const url = new URL(urlPreAssinada({ url: objeto, expiraEmSegundos: 60, credenciais: supabase, regiao: "sa-east-1", instante: agora }));
    expect(url.origin + url.pathname).toBe(objeto);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": "chave-de-teste/20261219/sa-east-1/s3/aws4_request",
      "X-Amz-Date": "20261219T150405Z",
      "X-Amz-Expires": "60",
      "X-Amz-SignedHeaders": "host",
    });
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.href).not.toContain("segredo-de-teste");
  });
});
