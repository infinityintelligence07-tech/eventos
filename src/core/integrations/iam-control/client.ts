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

  return {
    async listarTurmas(filtros: { aPartirDe?: string; ate?: string } = {}): Promise<RespostaTurmas> {
      const url = new URL(`${base}/api/webhooks/eventos/turmas`);
      if (filtros.aPartirDe) url.searchParams.set("a_partir_de", filtros.aPartirDe);
      if (filtros.ate) url.searchParams.set("ate", filtros.ate);

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

      const leitura = respostaSchema.safeParse(await resposta.json());
      if (!leitura.success) {
        const campos = leitura.error.issues
          .slice(0, 5)
          .map((issue) => issue.path.join("."))
          .join(", ");
        throw new IamControlError(`Resposta do IAM Control fora do formato esperado (${campos})`);
      }
      return leitura.data;
    },
  };
}

export type IamControlClient = ReturnType<typeof createIamControlClient>;
