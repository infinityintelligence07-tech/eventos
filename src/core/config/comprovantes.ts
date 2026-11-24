import { z } from "zod";

// Armazenamento dos comprovantes de custo (docs/08 §11.4): o Storage do Supabase pelo protocolo S3, com uma chave
// de acesso S3 que só alcança o Storage. Nunca a service_role (docs/09 §6). Separado de leitura.ts: estas variáveis
// só existem no servidor web e ficar sem elas não impede o app de subir (o anexo fica desligado).

const opcional = z
  .string()
  .optional()
  .transform((valor) => (valor?.trim() ? valor.trim() : undefined));

const esquema = z.object({
  // Endpoint S3 do Storage, sem o bucket: https://<projeto>.storage.supabase.co/storage/v1/s3
  COMPROVANTES_S3_ENDPOINT: opcional.pipe(z.string().url().optional()),
  // Região do projeto (ex.: sa-east-1). Entra na assinatura.
  COMPROVANTES_S3_REGIAO: opcional,
  // Bucket privado (ex.: eventos-comprovantes).
  COMPROVANTES_S3_BUCKET: opcional.pipe(z.string().regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/).optional()),
  // Chave de acesso S3 do Storage (id e segredo). Só no servidor; nunca em log.
  COMPROVANTES_S3_CHAVE_ID: opcional,
  COMPROVANTES_S3_CHAVE_SEGREDO: opcional,
});

export const VARIAVEIS_DOS_COMPROVANTES = [
  "COMPROVANTES_S3_ENDPOINT",
  "COMPROVANTES_S3_REGIAO",
  "COMPROVANTES_S3_BUCKET",
  "COMPROVANTES_S3_CHAVE_ID",
  "COMPROVANTES_S3_CHAVE_SEGREDO",
] as const;

export type ConfigDosComprovantes = { endpoint: string; regiao: string; bucket: string; chaveId: string; segredo: string };

export type LeituraDosComprovantes =
  | { situacao: "CONFIGURADO"; config: ConfigDosComprovantes }
  /** Nenhuma variável: o anexo fica desligado e o formulário funciona sem ele. */
  | { situacao: "DESLIGADO" }
  /** Só parte das variáveis, ou valor inválido: desligado também, com os nomes do que falta (nunca os valores). */
  | { situacao: "INCOMPLETO"; faltando: string[] };

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Puro (recebe o ambiente): usado pelo app e pelo comando de diagnóstico. */
export function lerComprovantesDoAmbiente(ambiente: NodeJS.ProcessEnv): LeituraDosComprovantes {
  const definidas = VARIAVEIS_DOS_COMPROVANTES.filter((nome) => ambiente[nome]?.trim());
  if (definidas.length === 0) return { situacao: "DESLIGADO" };

  const resultado = esquema.safeParse(ambiente);
  const invalidas = resultado.success ? [] : resultado.error.issues.map((issue) => String(issue.path[0]));
  const faltando = new Set<string>([...VARIAVEIS_DOS_COMPROVANTES.filter((nome) => !definidas.includes(nome)), ...invalidas]);
  if (resultado.success) {
    const endpoint = new URL(resultado.data.COMPROVANTES_S3_ENDPOINT!);
    // Fora do computador de quem desenvolve, só https: a chave e os arquivos não trafegam em claro.
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && HOSTS_LOCAIS.has(endpoint.hostname))) faltando.add("COMPROVANTES_S3_ENDPOINT");
    if (endpoint.search || endpoint.hash || endpoint.username || endpoint.password) faltando.add("COMPROVANTES_S3_ENDPOINT");
  }
  if (faltando.size > 0 || !resultado.success) return { situacao: "INCOMPLETO", faltando: [...faltando].sort() };

  const dados = resultado.data;
  return {
    situacao: "CONFIGURADO",
    config: {
      endpoint: dados.COMPROVANTES_S3_ENDPOINT!,
      regiao: dados.COMPROVANTES_S3_REGIAO!,
      bucket: dados.COMPROVANTES_S3_BUCKET!,
      chaveId: dados.COMPROVANTES_S3_CHAVE_ID!,
      segredo: dados.COMPROVANTES_S3_CHAVE_SEGREDO!,
    },
  };
}

let lida: LeituraDosComprovantes | undefined;

export function lerConfigDosComprovantes(): LeituraDosComprovantes {
  lida ??= lerComprovantesDoAmbiente(process.env);
  return lida;
}
