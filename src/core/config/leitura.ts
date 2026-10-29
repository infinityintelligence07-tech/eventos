import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  WORKER_DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  // IAM Control: leitura das turmas (GET /api/webhooks/eventos/turmas), token exclusivo do Eventos.
  IAM_CONTROL_URL: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.string().url().optional()),
  IAM_CONTROL_EVENTOS_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // "local": npm run dev:local, banco em .banco-local/ com staff fictício. Ausente = ambiente normal.
  EVENTOS_MODO: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.enum(["local"]).optional()),
}).refine(
  (env) => env.EVENTOS_MODO !== "local" || apontaParaLocalhost(env.DATABASE_URL),
  { path: ["DATABASE_URL"], message: "com EVENTOS_MODO=local, DATABASE_URL precisa apontar para localhost" },
);

// Triagem na subida (o instrumentation.ts também roda no runtime edge, sem o pg-connection-string). A decisão de
// escrita usa bancoLocalDaUrl (banco-local.ts), com o mesmo parser do driver.
export const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** host/hostaddr trocam o servidor e options injeta parâmetros na sessão (-c eventos.ambiente=local). */
export const PARAMETROS_QUE_DESVIAM = new Set(["host", "hostaddr", "options"]);

export function apontaParaLocalhost(url: string): boolean {
  try {
    const lida = new URL(url);
    if ([...lida.searchParams.keys()].some((nome) => PARAMETROS_QUE_DESVIAM.has(nome.toLowerCase()))) return false;
    return HOSTS_LOCAIS.has(lida.hostname);
  } catch {
    return false;
  }
}

export type Config = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): Config {
  const result = environmentSchema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  const invalidVariables = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Configuração inválida: ${invalidVariables}`);
}

let lida: Config | undefined;

/** Lê o ambiente na primeira chamada. Quem roda no build do Next usa esta função, não `config`. */
export function lerConfig(): Config {
  lida ??= parseEnvironment(process.env);
  return lida;
}
