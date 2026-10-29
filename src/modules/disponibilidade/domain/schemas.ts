import { z } from "zod";

import type { Resposta } from "./respostas";
import { instanteDeSaoPaulo } from "./tempo";

// Schemas das server actions (docs/07 §6.4). Os que dependem do relógio recebem `agora`.

const MENSAGEM_DATA_NO_PASSADO = "Escolha uma data a partir de hoje.";

const titulo = z.string().trim().min(3, "Use pelo menos 3 caracteres.").max(120, "Use no máximo 120 caracteres.");

function fechaEmFuturo(agora: Date) {
  return z
    .string()
    .transform((texto, contexto) => {
      const instante = instanteDeSaoPaulo(texto);
      if (!instante) {
        contexto.addIssue({ code: "custom", message: "Informe data e hora." });
        return z.NEVER;
      }
      return instante;
    })
    .refine((instante) => instante.getTime() > agora.getTime(), MENSAGEM_DATA_NO_PASSADO);
}

const listaDeEventos = z.preprocess(
  (valor) => (valor === undefined ? [] : Array.isArray(valor) ? valor : [valor]),
  z
    .array(z.uuid("Evento inválido."))
    .min(1, "Escolha pelo menos um evento.")
    .max(100, "Escolha até 100 eventos.")
    .transform((ids) => [...new Set(ids)]),
);

export function abrirEnqueteSchema(agora: Date) {
  return z.object({ titulo, fechaEm: fechaEmFuturo(agora), eventoIds: listaDeEventos });
}

export type AbrirEnquete = z.output<ReturnType<typeof abrirEnqueteSchema>>;

/** Alterar título e/ou "Fecha em". "Reabrir" é alterar com uma data nova. */
export function alterarEnqueteSchema(agora: Date) {
  return z
    .object({ enqueteId: z.uuid(), titulo: titulo.optional(), fechaEm: fechaEmFuturo(agora).optional() })
    .refine((dados) => dados.titulo !== undefined || dados.fechaEm !== undefined, "Informe o que mudar.");
}

export type AlterarEnquete = z.output<ReturnType<typeof alterarEnqueteSchema>>;

export const encerrarEnqueteSchema = z.object({ enqueteId: z.uuid() });

export type EncerrarEnquete = z.output<typeof encerrarEnqueteSchema>;

export const registrarDisponibilidadeSchema = z.object({
  enqueteId: z.uuid(),
  pessoaId: z.uuid("Escolha a pessoa."),
  respostas: z
    .array(z.object({ eventoId: z.uuid(), resposta: z.enum(["PODE", "NAO_PODE", "SEM_RESPOSTA"] satisfies Resposta[]) }))
    .min(1, "Responda pelo menos um evento.")
    .max(100, "Até 100 eventos por resposta.")
    .refine((respostas) => new Set(respostas.map((item) => item.eventoId)).size === respostas.length, "Evento repetido nas respostas."),
});

export type RegistrarDisponibilidade = z.output<typeof registrarDisponibilidadeSchema>;
