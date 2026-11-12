import { z } from "zod";

// Cliente da rota de leitura que o IAM Control expõe para o Eventos
// (IAM-Control-Backend: src/modules/api/integracao-eventos).

const texto = z.string().nullable();

const turmaSchema = z.object({
  id: z.number().int().positive(),
  edicao: z.union([z.string(), z.number()]).nullable().transform((valor) => (valor === null ? null : String(valor))),
  data_inicio: texto,
  data_final: texto,
  status_turma: z.string(),
  status_evento: texto,
  meta: z.number().int().nullable(),
  capacidade: z.number().int().nullable(),
  inscritos_ativos: z.number().int().min(0),
  // Alunos que confirmaram presença (aguardando check-in ou com check-in feito). Opcional: versões da rota anteriores a 11/2026 não mandam.
  confirmados: z.number().int().min(0).nullish(),
  treinamento: z.object({
    id: z.number().int(),
    nome: texto,
    sigla: texto,
    tipo_evento: z.boolean(),
    tipo_palestra: z.boolean(),
  }),
  polo: z
    .object({ id: z.number().int(), sigla: z.string(), nome: z.string(), cidade: z.string(), estado: z.string() })
    .nullable(),
  local: z.object({
    nome: texto,
    logradouro: texto,
    numero: texto,
    complemento: texto,
    bairro: texto,
    cidade: texto,
    estado: texto,
    cep: texto,
  }),
  atualizado_em: z.string(),
  excluida_em: texto,
});

const respostaSchema = z.object({
  a_partir_de: z.string(),
  ate: texto,
  total: z.number().int(),
  turmas: z.array(turmaSchema),
});

export type TurmaRecebida = z.infer<typeof turmaSchema>;
export type RespostaTurmas = z.infer<typeof respostaSchema>;

// GET /api/webhooks/eventos/colaboradores: contas do IAM Control, sem documentos nem endereço completo.
const colaboradorSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string(),
  email: z.string(),
  telefone: texto,
  cidade: texto,
  estado: texto,
  setores: z.array(z.string()),
  funcoes: z.array(z.string()),
  ativo: z.boolean(),
  atualizado_em: z.string(),
  excluido_em: texto,
});

const respostaColaboradoresSchema = z.object({
  total: z.number().int(),
  colaboradores: z.array(colaboradorSchema),
});

export type ColaboradorRecebido = z.infer<typeof colaboradorSchema>;
export type RespostaColaboradores = z.infer<typeof respostaColaboradoresSchema>;

export class IamControlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "IamControlError";
  }
}

export type IamControlClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export function createIamControlClient(options: IamControlClientOptions) {
  const fetchFn = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");

  async function lerJson<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
    let resposta: Response;
    try {
      resposta = await fetchFn(url, {
        headers: { "x-webhook-token": options.token, accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch (cause: unknown) {
      throw new IamControlError(`IAM Control indisponível: ${cause instanceof Error ? cause.message : String(cause)}`);
    }

    if (resposta.status === 401 || resposta.status === 403) {
      throw new IamControlError("IAM Control recusou o token (confira IAM_CONTROL_EVENTOS_TOKEN)", resposta.status);
    }
    if (!resposta.ok) {
      throw new IamControlError(`IAM Control respondeu ${resposta.status}`, resposta.status);
    }

    const leitura = schema.safeParse(await resposta.json());
    if (!leitura.success) {
      const campos = leitura.error.issues
        .slice(0, 5)
        .map((issue) => issue.path.join("."))
        .join(", ");
      throw new IamControlError(`Resposta do IAM Control fora do formato esperado (${campos})`);
    }
    return leitura.data;
  }

  return {
    async listarTurmas(filtros: { aPartirDe?: string; ate?: string } = {}): Promise<RespostaTurmas> {
      const url = new URL(`${base}/api/webhooks/eventos/turmas`);
      if (filtros.aPartirDe) url.searchParams.set("a_partir_de", filtros.aPartirDe);
      if (filtros.ate) url.searchParams.set("ate", filtros.ate);
      return lerJson(url, respostaSchema);
    },

    async listarColaboradores(): Promise<RespostaColaboradores> {
      return lerJson(new URL(`${base}/api/webhooks/eventos/colaboradores`), respostaColaboradoresSchema);
    },
  };
}

export type IamControlClient = ReturnType<typeof createIamControlClient>;

const loginSchema = z.object({ user: z.object({ email: z.string() }) });

export type ResultadoDaSenha = { ok: true; email: string } | { ok: false };

/**
 * Confere e-mail e senha no IAM Control (POST /api/auth/login, a mesma rota do site dele): só contas aprovadas e não
 * excluídas passam. A senha vai só para o IAM Control, por HTTPS; o Eventos não a guarda nem a registra no log.
 * O token que o IAM Control devolve é descartado. 401/403 = credenciais recusadas (ou conta pendente), sem distinguir.
 */
export async function conferirSenhaNoIamControl(
  options: Pick<IamControlClientOptions, "baseUrl" | "fetch" | "timeoutMs">,
  email: string,
  senha: string,
): Promise<ResultadoDaSenha> {
  const fetchFn = options.fetch ?? fetch;
  let resposta: Response;
  try {
    resposta = await fetchFn(new URL(`${options.baseUrl.replace(/\/+$/, "")}/api/auth/login`), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, senha, provider: "credentials" }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (cause: unknown) {
    throw new IamControlError(`IAM Control indisponível: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (resposta.status === 400 || resposta.status === 401 || resposta.status === 403) return { ok: false };
  if (!resposta.ok) throw new IamControlError(`IAM Control respondeu ${resposta.status}`, resposta.status);
  const leitura = loginSchema.safeParse(await resposta.json().catch(() => null));
  if (!leitura.success) throw new IamControlError("Resposta do login do IAM Control fora do formato esperado");
  return { ok: true, email: leitura.data.user.email.trim().toLowerCase() };
}
