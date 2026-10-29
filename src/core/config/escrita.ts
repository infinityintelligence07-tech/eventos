import { z } from "zod";

// Variáveis da guarda de escrita em produção (docs/09 §5). Separadas de leitura.ts para a frente de login (dona de
// leitura.ts nesta rodada) e a de autorização não editarem o mesmo arquivo; podem ser juntadas depois.

const esquemaDeEscrita = z.object({
  // "producao": liga o modo PRODUCAO da guarda (com NODE_ENV=production e DATABASE_URL_ESCRITA). Ausente = sem escrita
  // fora do modo local. Qualquer outro valor é configuração inválida (e a guarda fecha).
  EVENTOS_ESCRITA: z
    .string()
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor))
    .pipe(z.enum(["producao"]).optional()),
  // Conexão própria da escrita em produção, no papel app_eventos (a DATABASE_URL das páginas é a de leitura).
  DATABASE_URL_ESCRITA: z
    .string()
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor)),
});

export type ConfigDeEscrita = z.infer<typeof esquemaDeEscrita>;

let lida: ConfigDeEscrita | undefined;

/** Lança se EVENTOS_ESCRITA tiver valor desconhecido (quem chama trata como guarda fechada). */
export function lerConfigDeEscrita(): ConfigDeEscrita {
  if (lida) return lida;
  const resultado = esquemaDeEscrita.safeParse(process.env);
  if (!resultado.success) throw new Error(`Configuração de escrita inválida: ${resultado.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  lida = resultado.data;
  return lida;
}
