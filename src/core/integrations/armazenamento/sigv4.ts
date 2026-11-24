import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4 para S3 (o Storage do Supabase fala esse protocolo), só com node:crypto. Puro: recebe o
// instante e as credenciais e devolve os cabeçalhos ou a URL assinada; não faz rede nem lê ambiente.
// Referência: "Authenticating Requests (AWS Signature Version 4)" da documentação do S3. Os testes usam os
// exemplos publicados lá (AKIAIOSFODNN7EXAMPLE, 24/05/2013).

export type CredenciaisS3 = { chaveId: string; segredo: string };

const ALGORITMO = "AWS4-HMAC-SHA256";
const SERVICO = "s3";

/** Marca do S3 para corpo fora da assinatura (URL pré-assinada). */
export const CORPO_NAO_ASSINADO = "UNSIGNED-PAYLOAD";

export function sha256Hex(conteudo: string | Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

const hmac = (chave: string | Buffer, texto: string): Buffer => createHmac("sha256", chave).update(texto, "utf8").digest();

/** RFC 3986: só letras, dígitos e -_.~ ficam como estão; o resto vira %XX em maiúsculas. */
function codificar(texto: string): string {
  return encodeURIComponent(texto).replace(/[!'()*]/g, (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Caminho canônico do S3: cada segmento codificado uma vez (o S3 não codifica duas vezes) e as barras mantidas. */
function caminhoCanonico(caminho: string): string {
  return caminho
    .split("/")
    .map((segmento) => codificar(decodeURIComponent(segmento)))
    .join("/");
}

/** Parâmetros codificados e em ordem de nome (e de valor, no empate). */
function consultaCanonica(parametros: [string, string][]): string {
  return parametros
    .map(([nome, valor]) => [codificar(nome), codificar(valor)] as const)
    .sort(([nomeA, valorA], [nomeB, valorB]) => (nomeA === nomeB ? (valorA < valorB ? -1 : valorA > valorB ? 1 : 0) : nomeA < nomeB ? -1 : 1))
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join("&");
}

/** 20130524T000000Z */
export function instanteAmz(instante: Date): string {
  return instante.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

type PedidoCanonico = { metodo: string; url: URL; consulta: [string, string][]; cabecalhos: Record<string, string>; corpoSha256: string };

function cabecalhosCanonicos(cabecalhos: Record<string, string>): { texto: string; assinados: string } {
  const pares = Object.entries(cabecalhos)
    .map(([nome, valor]) => [nome.toLowerCase(), valor.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { texto: pares.map(([nome, valor]) => `${nome}:${valor}\n`).join(""), assinados: pares.map(([nome]) => nome).join(";") };
}

export function pedidoCanonico({ metodo, url, consulta, cabecalhos, corpoSha256 }: PedidoCanonico): { texto: string; cabecalhosAssinados: string } {
  const { texto, assinados } = cabecalhosCanonicos(cabecalhos);
  return {
    texto: [metodo.toUpperCase(), caminhoCanonico(url.pathname), consultaCanonica(consulta), texto, assinados, corpoSha256].join("\n"),
    cabecalhosAssinados: assinados,
  };
}

const escopo = (dia: string, regiao: string) => `${dia}/${regiao}/${SERVICO}/aws4_request`;

export function textoParaAssinar(canonico: string, amz: string, regiao: string): string {
  return [ALGORITMO, amz, escopo(amz.slice(0, 8), regiao), sha256Hex(canonico)].join("\n");
}

function assinatura(segredo: string, amz: string, regiao: string, paraAssinar: string): string {
  const chaveDoDia = hmac(`AWS4${segredo}`, amz.slice(0, 8));
  const chaveFinal = hmac(hmac(hmac(chaveDoDia, regiao), SERVICO), "aws4_request");
  return hmac(chaveFinal, paraAssinar).toString("hex");
}

export type PedidoParaAssinar = {
  metodo: "GET" | "PUT" | "DELETE" | "HEAD";
  /** Endereço completo do objeto (estilo de caminho: `<endpoint>/<bucket>/<chave>`). */
  url: string;
  /** Cabeçalhos que entram na assinatura além de host, x-amz-date e x-amz-content-sha256. */
  cabecalhos?: Record<string, string>;
  /** SHA-256 do corpo em hexadecimal (o do corpo vazio para GET e DELETE). */
  corpoSha256: string;
  credenciais: CredenciaisS3;
  regiao: string;
  instante: Date;
};

/** Cabeçalhos da requisição, com `Authorization`. Quem envia põe exatamente estes (o `host` sai da própria URL). */
export function assinarRequisicao({ metodo, url, cabecalhos = {}, corpoSha256, credenciais, regiao, instante }: PedidoParaAssinar): Record<string, string> {
  const endereco = new URL(url);
  const amz = instanteAmz(instante);
  const paraEnviar = { ...cabecalhos, "x-amz-content-sha256": corpoSha256, "x-amz-date": amz };
  const { texto, cabecalhosAssinados } = pedidoCanonico({
    metodo,
    url: endereco,
    consulta: [...endereco.searchParams.entries()],
    cabecalhos: { ...paraEnviar, host: endereco.host },
    corpoSha256,
  });
  const valor = assinatura(credenciais.segredo, amz, regiao, textoParaAssinar(texto, amz, regiao));
  return {
    ...paraEnviar,
    Authorization: `${ALGORITMO} Credential=${credenciais.chaveId}/${escopo(amz.slice(0, 8), regiao)},SignedHeaders=${cabecalhosAssinados},Signature=${valor}`,
  };
}

export type UrlParaAssinar = {
  /** Endereço completo do objeto, sem parâmetros de assinatura. */
  url: string;
  /** Validade em segundos (o S3 aceita de 1 a 604800). */
  expiraEmSegundos: number;
  credenciais: CredenciaisS3;
  regiao: string;
  instante: Date;
};

/** URL de GET que vale por pouco tempo, sem credencial em cabeçalho: quem tem a URL lê o objeto até ela vencer. */
export function urlPreAssinada({ url, expiraEmSegundos, credenciais, regiao, instante }: UrlParaAssinar): string {
  const endereco = new URL(url);
  const amz = instanteAmz(instante);
  const consulta: [string, string][] = [
    ...endereco.searchParams.entries(),
    ["X-Amz-Algorithm", ALGORITMO],
    ["X-Amz-Credential", `${credenciais.chaveId}/${escopo(amz.slice(0, 8), regiao)}`],
    ["X-Amz-Date", amz],
    ["X-Amz-Expires", String(expiraEmSegundos)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const { texto } = pedidoCanonico({ metodo: "GET", url: endereco, consulta, cabecalhos: { host: endereco.host }, corpoSha256: CORPO_NAO_ASSINADO });
  const valor = assinatura(credenciais.segredo, amz, regiao, textoParaAssinar(texto, amz, regiao));
  return `${endereco.origin}${caminhoCanonico(endereco.pathname)}?${consultaCanonica(consulta)}&X-Amz-Signature=${valor}`;
}
