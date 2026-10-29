import { z } from "zod";

// Entradas das server actions da escala (docs/07 §6.2 e §6.8). Reaproveitadas nos testes.

const id = z.uuid("Identificador inválido.");
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use até ${maximo} caracteres.`)
    .optional()
    .transform((texto) => (texto ? texto : undefined));
const quantidadeDeVagas = z.coerce
  .number({ error: "Informe um número." })
  .int("Use um número inteiro.")
  .min(1, "Informe pelo menos 1 vaga.")
  .max(500, "Use até 500 vagas.");
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const confirmarVagasSchema = z.object({
  eventoId: id,
  linhas: z.array(z.object({ escalaId: id, quantidade: quantidadeDeVagas })).min(1, "Nenhuma função para confirmar.").max(100, "Até 100 funções."),
});

/** Muda o número sem confirmar (desfaz a confirmação, se havia). */
export const alterarVagasSchema = z.object({ eventoId: id, escalaId: id, quantidade: quantidadeDeVagas });

export const adicionarVagaManualSchema = z.object({ eventoId: id, funcaoId: id, data, quantidade: quantidadeDeVagas });

/** Função digitada da regra (Staff do Confronto): cria a linha já com o número confirmado. */
export const definirVagaDigitadaSchema = z.object({ eventoId: id, funcao: z.string().regex(/^[A-Z0-9_]{2,30}$/, "Função inválida."), quantidade: quantidadeDeVagas });

export const removerVagaManualSchema = z.object({ eventoId: id, escalaId: id });

export const porNaVagaSchema = z.object({
  eventoId: id,
  escalaId: id,
  pessoaId: id,
  sugestaoScore: z.coerce.number().min(0).max(9999).optional(),
});

export const tirarDaVagaSchema = z.object({ eventoId: id, convocacaoId: id });

export const DESLOCAMENTOS = ["CARRO_PROPRIO", "CARONA", "CARRO_IAM", "UBER", "ONIBUS", "VOO", "NAO_SE_APLICA"] as const;
export type Deslocamento = (typeof DESLOCAMENTOS)[number];

export const atualizarConvocacaoSchema = z.object({
  eventoId: id,
  convocacaoId: id,
  deslocamento: z.enum(DESLOCAMENTOS).optional(),
});

export const enviarParaAprovacaoSchema = z.object({ eventoId: id, statusEsperado: z.enum(["RASCUNHO", "DEVOLVIDA"]) });

export const aprovarEscalaSchema = z.object({ eventoId: id });

export const devolverEscalaSchema = z.object({ eventoId: id, comentario: textoOpcional(1000) });

export const reabrirEscalaSchema = z.object({
  eventoId: id,
  statusEsperado: z.enum(["APROVADA", "COMUNICADA"]),
  motivo: textoOpcional(1000),
});

export const registrarRespostaDoStaffSchema = z
  .object({
    eventoId: id,
    convocacaoId: id,
    resposta: z.enum(["ACEITA", "RECUSADA"], { error: "Escolha Confirmou ou Não pode." }),
    motivoRecusa: textoOpcional(500),
  })
  .transform((entrada) => (entrada.resposta === "ACEITA" ? { ...entrada, motivoRecusa: undefined } : entrada));

const codigoDaFuncao = z.string().regex(/^[A-Z0-9_]{2,30}$/, "Escolha a função.");

const linhaDaRegraSchema = z.discriminatedUnion("modo", [
  z.object({ funcao: codigoDaFuncao, modo: z.literal("FIXO"), quantidade: z.coerce.number().int("Use um número inteiro.").min(0).max(500) }),
  z.object({ funcao: codigoDaFuncao, modo: z.literal("POR_PUBLICO"), cada: z.coerce.number().int("Use um número inteiro.").min(1, "Informe pelo menos 1.").max(10000) }),
  z.object({ funcao: codigoDaFuncao, modo: z.literal("POR_FILA"), cada: z.coerce.number().int("Use um número inteiro.").min(1, "Informe pelo menos 1.").max(10000) }),
  z.object({
    funcao: codigoDaFuncao,
    modo: z.literal("POR_FUNCAO"),
    multiplicador: z.coerce.number().int("Use um número inteiro.").min(1).max(50),
    base: z.string().regex(/^[A-Z0-9_]{2,30}$/, "Escolha a função de base."),
  }),
  z.object({ funcao: codigoDaFuncao, modo: z.literal("DIGITADO") }),
  z.object({ funcao: codigoDaFuncao, modo: z.literal("PERSONALIZADA"), formula: z.string().min(1).max(500, "Use até 500 caracteres.") }),
]);

export const salvarRegraDeVagasSchema = z.object({
  tipoEventoId: id,
  funcoes: z.array(linhaDaRegraSchema).max(50, "Até 50 funções.").default([]),
});

export const recalcularVagasDoTipoSchema = z.object({ tipoEventoId: id });
