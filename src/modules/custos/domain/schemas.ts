import { z } from "zod";

import { CATEGORIAS_DO_ITEM } from "./auditoria";

// Schemas das server actions de Custos e de Configurações › Regras de custo (docs/07 §6.7 e §6.8).
// Os campos chegam do FormData como texto; texto vazio já chega ausente.

const id = z.uuid("Escolha uma opção da lista.");

function dataValida(texto: string): boolean {
  const data = new Date(`${texto}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data.").refine(dataValida, "Data inválida.");

/**
 * Número digitado com até `casas` decimais ("412,5", "1.234,5", "12.5") → unidades de 10^-casas, em inteiro.
 * Sem ponto flutuante na leitura: "0,1" vira exatamente 1 décimo.
 */
export function unidadesDoTexto(texto: string, casas: number): number | null {
  const limpo = texto.replace(/\s|R\$/g, "");
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const partes = new RegExp(`^(\\d{1,9})(?:\\.(\\d{1,${casas}}))?$`).exec(normalizado);
  if (!partes) return null;
  return Number(partes[1]) * 10 ** casas + Number((partes[2] ?? "").padEnd(casas, "0"));
}

export function centavosDoTexto(texto: string): number | null {
  return unidadesDoTexto(texto, 2);
}

function numeroDigitado(casas: number, mensagem: string) {
  return z.string().max(30, "Número longo demais.").transform((texto, contexto) => {
    const unidades = unidadesDoTexto(texto, casas);
    if (unidades === null) {
      contexto.addIssue({ code: "custom", message: mensagem });
      return z.NEVER;
    }
    return unidades / 10 ** casas;
  });
}

/** Valor em reais digitado → centavos. */
export const dinheiro = z.string().max(30, "Valor longo demais.").transform((texto, contexto) => {
  const centavos = centavosDoTexto(texto);
  if (centavos === null) {
    contexto.addIssue({ code: "custom", message: "Informe um valor em reais (ex.: 6,19)." });
    return z.NEVER;
  }
  return centavos;
});

const marcado = z.preprocess((valor) => valor === "on" || valor === "true" || valor === true, z.boolean());

const textoObrigatorio = (maximo: number, mensagem: string) => z.string().trim().min(1, mensagem).max(maximo, `Use até ${maximo} caracteres.`);

export const deslocamentoSchema = z.object({
  origem: textoObrigatorio(200, "Informe de onde a pessoa saiu."),
  destino: textoObrigatorio(200, "Informe para onde a pessoa foi."),
  idaVolta: marcado,
  km: numeroDigitado(1, "Informe os km com até uma casa (ex.: 412,5).").pipe(z.number().max(99_999.9, "Km acima do permitido.")),
  consumoKmL: numeroDigitado(1, "Informe o consumo com até uma casa (ex.: 10,5).").pipe(
    z.number().gt(0, "O consumo precisa ser maior que zero.").max(99.9, "Consumo acima do permitido."),
  ),
  precoLitroCentavos: dinheiro,
  pedagioCentavos: dinheiro.default(0),
});
export type EntradaDeDeslocamento = z.output<typeof deslocamentoSchema>;

export const itemSchema = z.object({
  categoria: z.enum(CATEGORIAS_DO_ITEM),
  regraCustoId: id.optional(),
  descricao: textoObrigatorio(200, "Descreva o item."),
  quantidade: numeroDigitado(2, "Informe a quantidade (ex.: 1 ou 2,5).").pipe(z.number().gt(0, "A quantidade precisa ser maior que zero.").max(999_999.99)),
  valorCentavos: dinheiro,
});
export type EntradaDeItem = z.output<typeof itemSchema>;

const linhasDaSolicitacao = {
  deslocamentos: z.array(deslocamentoSchema).max(10, "Até 10 deslocamentos.").default([]),
  itens: z.array(itemSchema).max(20, "Até 20 itens.").default([]),
};

const temAlgumaLinha = (solicitacao: { deslocamentos: unknown[]; itens: unknown[] }) => solicitacao.deslocamentos.length + solicitacao.itens.length > 0;
const MENSAGEM_SEM_LINHA = "Informe pelo menos um deslocamento ou um item.";

export const registrarSolicitacaoSchema = z
  .object({ eventoId: id, pessoaId: id, ...linhasDaSolicitacao })
  .refine(temAlgumaLinha, MENSAGEM_SEM_LINHA);
export type RegistrarSolicitacao = z.output<typeof registrarSolicitacaoSchema>;

export const corrigirSolicitacaoSchema = z
  .object({ solicitacaoId: id, atualizadoEm: z.iso.datetime({ offset: true }), ...linhasDaSolicitacao })
  .refine(temAlgumaLinha, MENSAGEM_SEM_LINHA);
export type CorrigirSolicitacao = z.output<typeof corrigirSolicitacaoSchema>;

const versao = { solicitacaoId: id, atualizadoEm: z.iso.datetime({ offset: true }) };

export const aprovarSolicitacaoSchema = z.object({ ...versao, parecer: z.string().trim().max(1000, "Use até 1.000 caracteres.").optional() });
export type AprovarSolicitacao = z.output<typeof aprovarSolicitacaoSchema>;

export const reprovarSolicitacaoSchema = z.object({
  ...versao,
  motivo: z.string().trim().min(3, "Escreva o motivo (pelo menos 3 caracteres).").max(1000, "Use até 1.000 caracteres."),
});
export type ReprovarSolicitacao = z.output<typeof reprovarSolicitacaoSchema>;

export const reabrirAuditoriaSchema = z.object(versao);
export type ReabrirAuditoria = z.output<typeof reabrirAuditoriaSchema>;

export const criarVigenciaDeRegraSchema = z.object({
  regraId: id,
  valorCentavos: dinheiro.optional(),
  kmMin: numeroDigitado(2, "Informe os km (ex.: 100).").optional(),
  kmMax: numeroDigitado(2, "Informe os km (ex.: 249,99).").optional(),
  kmLMin: numeroDigitado(1, "Informe o consumo (ex.: 7,5).").optional(),
  kmLMax: numeroDigitado(1, "Informe o consumo (ex.: 22).").optional(),
  custoKmMaxCentavos: dinheiro.optional(),
  vigenteDesde: data,
  observacao: z.string().trim().max(500, "Use até 500 caracteres.").optional(),
});
export type CriarVigenciaDeRegra = z.output<typeof criarVigenciaDeRegraSchema>;

export const desativarRegraSchema = z.object({ regraId: id });
