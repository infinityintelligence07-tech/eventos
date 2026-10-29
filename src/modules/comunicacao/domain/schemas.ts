import { z } from "zod";

import { validarModelo } from "./copy";
import { TIPOS_DE_MODELO } from "./situacao";

// Entradas das server actions da Comunicação e de Configurações › Modelos de copy (docs/07 §6.3 e §6.8).

export const CHAVE_LINK_CUSTOS = "link_custos";

const HASH = z.string().regex(/^[0-9a-f]{64}$/, "Copy inválida. Recarregue a página.");

export const marcarCopyComoEnviadaSchema = z.object({
  convocacaoId: z.uuid(),
  modeloId: z.uuid(),
  dadosHash: HASH,
});
export type MarcarCopyComoEnviada = z.output<typeof marcarCopyComoEnviadaSchema>;

export const LIMITE_DO_CORPO = 4000;

export const corpoDoModeloSchema = z
  .string()
  .max(LIMITE_DO_CORPO, `O texto passa de ${LIMITE_DO_CORPO.toLocaleString("pt-BR")} caracteres.`)
  .refine((corpo) => corpo.trim().length > 0, "Escreva o texto do modelo.")
  .superRefine((corpo, contexto) => {
    for (const erro of validarModelo(corpo)) contexto.addIssue({ code: "custom", message: erro });
  });

export const salvarModeloSchema = z.object({
  modeloId: z.uuid().optional(),
  tipo: z.enum(TIPOS_DE_MODELO, "Escolha o tipo do modelo."),
  nome: z.string().trim().min(3, "Use pelo menos 3 letras.").max(80, "Use até 80 caracteres."),
  corpo: corpoDoModeloSchema,
  /** Modelo novo nasce inativo; marcado, passa a ser o usado na Comunicação (o anterior do tipo é desativado). */
  ativar: z.stringbool().default(false),
});
export type SalvarModelo = z.output<typeof salvarModeloSchema>;

export const definirModeloAtivoSchema = z.object({ modeloId: z.uuid(), ativo: z.stringbool() });

/** Vazio apaga o link: a copy que usa {{link_custos}} fica bloqueada até alguém preencher. */
export const salvarLinkDeCustosSchema = z.object({
  linkCustos: z
    .url({ protocol: /^https$/, error: "Use um endereço completo começando com https://." })
    .max(500, "Use até 500 caracteres.")
    .optional(),
});
export type SalvarLinkDeCustos = z.output<typeof salvarLinkDeCustosSchema>;

export const previaDoModeloSchema = z.object({
  corpo: z.string().max(LIMITE_DO_CORPO).default(""),
  /** Pessoa de exemplo: convocação e o evento dela. */
  convocacaoId: z.uuid().optional(),
  eventoId: z.uuid().optional(),
});
export type PreviaDoModelo = z.output<typeof previaDoModeloSchema>;
