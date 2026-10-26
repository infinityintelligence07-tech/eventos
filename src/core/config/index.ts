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
});

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

export const config = parseEnvironment(process.env);
