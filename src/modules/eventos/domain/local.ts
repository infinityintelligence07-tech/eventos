import { z } from "zod";

// Configurações › Locais e hotéis (docs/07 §6.8, docs/08 §12.4). Sem geocodificação automática nesta rodada:
// latitude e longitude são digitadas (a distância até o evento depende delas).

/** Valores do CHECK local_tipo_check. */
export const TIPOS_DE_LOCAL = ["EVENTO", "HOTEL", "APARTAMENTO"] as const;
export type TipoDeLocal = (typeof TIPOS_DE_LOCAL)[number];

export function rotuloDoTipoDeLocal(tipo: TipoDeLocal): string {
  switch (tipo) {
    case "EVENTO":
      return "Local de evento";
    case "HOTEL":
      return "Hotel";
    case "APARTAMENTO":
      return "Apartamento";
    default: {
      const desconhecido: never = tipo;
      throw new Error(`tipo de local desconhecido: ${String(desconhecido)}`);
    }
  }
}

export type UsoDoLocal = { eventos: number; hospedagens: number };

/** Local em uso não é arquivado (eventos e hospedagens apontam para ele). Nulo = pode arquivar. */
export function motivoParaNaoArquivar(uso: UsoDoLocal): string | null {
  const partes = [
    uso.eventos > 0 ? (uso.eventos === 1 ? "1 evento" : `${uso.eventos} eventos`) : null,
    uso.hospedagens > 0 ? (uso.hospedagens === 1 ? "1 hospedagem" : `${uso.hospedagens} hospedagens`) : null,
  ].filter(Boolean);
  return partes.length > 0 ? `Este local está em ${partes.join(" e ")}.` : null;
}

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use até ${maximo} caracteres.`)
    .optional()
    .transform((valor) => valor || null);

/** Aceita vírgula decimal ("-3,119"). */
const coordenada = (limite: number, nome: string) =>
  z.preprocess(
    (valor) => (typeof valor === "string" ? valor.trim().replace(",", ".") : valor),
    z.coerce
      .number({ error: `Informe a ${nome} em graus decimais.` })
      .min(-limite, `A ${nome} vai de -${limite} a ${limite}.`)
      .max(limite, `A ${nome} vai de -${limite} a ${limite}.`)
      .optional(),
  );

export const salvarLocalSchema = z
  .object({
    localId: z.uuid().optional(),
    nome: z.string().trim().min(2, "Informe o nome.").max(120, "Use até 120 caracteres."),
    tipo: z.enum(TIPOS_DE_LOCAL, "Escolha o tipo."),
    cep: z
      .string()
      .trim()
      .regex(/^\d{5}-?\d{3}$/, "Use o CEP com 8 números (00000-000).")
      .optional()
      .transform((valor) => (valor ? `${valor.replace("-", "").slice(0, 5)}-${valor.replace("-", "").slice(5)}` : null)),
    logradouro: textoOpcional(160),
    numero: textoOpcional(20),
    complemento: textoOpcional(80),
    bairro: textoOpcional(80),
    cidade: z.string().trim().min(2, "Informe a cidade.").max(80, "Use até 80 caracteres."),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a sigla do estado (SP, AM...)."),
    lat: coordenada(90, "latitude"),
    lng: coordenada(180, "longitude"),
    capacidade: z.coerce.number({ error: "Informe um número." }).int("Use um número inteiro.").positive("Informe um número maior que zero.").optional(),
  })
  .superRefine((local, contexto) => {
    if ((local.lat === undefined) !== (local.lng === undefined)) {
      contexto.addIssue({
        code: "custom",
        path: [local.lat === undefined ? "lat" : "lng"],
        message: "Informe latitude e longitude juntas (ou deixe as duas vazias).",
      });
    }
  })
  .transform(({ lat, lng, capacidade, ...local }) => ({ ...local, lat: lat ?? null, lng: lng ?? null, capacidade: capacidade ?? null }));
export type SalvarLocal = z.output<typeof salvarLocalSchema>;

export const arquivarLocalSchema = z.object({ localId: z.uuid() });
