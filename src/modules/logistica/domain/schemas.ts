import { z } from "zod";

// Schemas das server actions da Logística (docs/07 §6.6). Os campos chegam do FormData como texto;
// texto vazio já chega ausente (lerFormulario).

const id = z.uuid("Escolha uma opção da lista.");

const iata = z
  .string()
  .max(10, "Use o código de 3 letras do aeroporto (ex.: POA).")
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use o código de 3 letras do aeroporto (ex.: POA).");

function dataValida(texto: string): boolean {
  const data = new Date(`${texto}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data.").refine(dataValida, "Data inválida.");

const dataEHora = z
  .string()
  .max(40, "Informe data e hora.")
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Informe data e hora.")
  .refine((texto) => dataValida(texto.slice(0, 10)), "Data inválida.");

const textoOpcional = (maximo: number) => z.string().trim().max(maximo, `Use até ${maximo} caracteres.`).optional();

/** "1.234,56", "1234,56", "980" ou "980.5" → centavos inteiros (sem passar por ponto flutuante). */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.replace(/\s|R\$/g, "");
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const partes = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(normalizado);
  if (!partes) return null;
  return Number(partes[1]) * 100 + Number((partes[2] ?? "").padEnd(2, "0"));
}

/** Valor em reais digitado → centavos. */
export const dinheiro = z
  .string()
  .max(30, "Valor longo demais.")
  .transform((texto, contexto) => {
    const centavos = centavosDoTexto(texto);
    if (centavos === null) {
      contexto.addIssue({ code: "custom", message: "Informe um valor em reais (ex.: 980,00)." });
      return z.NEVER;
    }
    return centavos;
  });

export const SENTIDOS = ["IDA", "VOLTA"] as const;
export const PREFERENCIAS = ["MANHA", "TARDE", "NOITE", "QUALQUER"] as const;

const trechoDesejadoSchema = z
  .object({
    sentido: z.enum(SENTIDOS),
    origemIata: iata,
    destinoIata: iata,
    dataDesejada: data,
    preferenciaHorario: z.enum(PREFERENCIAS).optional(),
  })
  .refine((trecho) => trecho.origemIata !== trecho.destinoIata, { path: ["destinoIata"], message: "Origem e destino precisam ser diferentes." });

const trechosDesejadosSchema = z
  .array(trechoDesejadoSchema)
  .min(1, "Informe pelo menos um trecho.")
  .max(2, "Um pedido tem no máximo ida e volta.")
  .refine((trechos) => new Set(trechos.map((trecho) => trecho.sentido)).size === trechos.length, "Cada sentido aparece uma vez só.")
  .refine((trechos) => {
    const ida = trechos.find((trecho) => trecho.sentido === "IDA");
    const volta = trechos.find((trecho) => trecho.sentido === "VOLTA");
    return !ida || !volta || volta.dataDesejada >= ida.dataDesejada;
  }, "A volta não pode ser antes da ida.");

export const registrarPedidoDeVooSchema = z.object({
  convocacaoId: id,
  trechos: trechosDesejadosSchema,
  observacaoTime: textoOpcional(500),
});
export type RegistrarPedidoDeVoo = z.output<typeof registrarPedidoDeVooSchema>;

export const alterarPedidoSchema = z.object({
  pedidoId: id,
  trechos: trechosDesejadosSchema.optional(),
  observacaoTime: textoOpcional(500),
  atualizadoEm: z.iso.datetime({ offset: true }),
});
export type AlterarPedido = z.output<typeof alterarPedidoSchema>;

export const cancelarPedidoSchema = z.object({
  pedidoId: id,
  motivo: z.string().trim().min(3, "Escreva o motivo (pelo menos 3 caracteres).").max(500, "Use até 500 caracteres."),
});
export type CancelarPedido = z.output<typeof cancelarPedidoSchema>;

const trechoEmitidoSchema = z
  .object({
    sentido: z.enum(SENTIDOS),
    companhia: z.string().trim().min(2, "Informe a companhia.").max(40, "Use até 40 caracteres."),
    numeroVoo: z
      .string()
      .max(20, "Use o código do voo (ex.: AD4120).")
      .transform((texto) => texto.replace(/\s/g, "").toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{2}[0-9]{1,4}$/, "Use o código do voo (ex.: AD4120).")),
    localizador: z
      .string()
      .max(20, "O localizador tem de 5 a 8 letras ou números.")
      .transform((texto) => texto.replace(/\s/g, "").toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{5,8}$/, "O localizador tem de 5 a 8 letras ou números.")),
    partidaEm: dataEHora,
    chegadaEm: dataEHora,
    cartaoEmbarqueUrl: z
      .string()
      .trim()
      .regex(/^https:\/\/\S+$/, "Use um link que comece com https://.")
      .max(500, "Use até 500 caracteres.")
      .optional(),
  })
  .refine((trecho) => trecho.chegadaEm > trecho.partidaEm, { path: ["chegadaEm"], message: "A chegada precisa ser depois da partida." });

export const registrarRetornoDeVooSchema = z.object({
  pedidoId: id,
  valorCentavos: dinheiro,
  observacaoSdc: textoOpcional(500),
  trechos: z
    .array(trechoEmitidoSchema)
    .min(1, "Informe pelo menos um trecho.")
    .max(2)
    .refine((trechos) => new Set(trechos.map((trecho) => trecho.sentido)).size === trechos.length, "Cada sentido aparece uma vez só."),
});
export type RegistrarRetornoDeVoo = z.output<typeof registrarRetornoDeVooSchema>;

export const registrarRetornoDeHospedagemSchema = z.object({
  pedidoId: id,
  valorCentavos: dinheiro,
  numeroReserva: z.string().trim().min(1, "Informe o número da reserva.").max(60, "Use até 60 caracteres."),
  observacaoSdc: textoOpcional(500),
});
export type RegistrarRetornoDeHospedagem = z.output<typeof registrarRetornoDeHospedagemSchema>;

const periodoValido = { path: ["checkOut"], message: "O check-out precisa ser depois do check-in." };

export const criarHospedagemSchema = z
  .object({ eventoId: id, localId: id, checkIn: data, checkOut: data, observacao: textoOpcional(500) })
  .refine((hospedagem) => hospedagem.checkOut > hospedagem.checkIn, periodoValido);
export type CriarHospedagem = z.output<typeof criarHospedagemSchema>;

export const alterarHospedagemSchema = z
  .object({
    hospedagemId: id,
    localId: id,
    checkIn: data,
    checkOut: data,
    observacao: textoOpcional(500),
    atualizadoEm: z.iso.datetime({ offset: true }),
  })
  .refine((hospedagem) => hospedagem.checkOut > hospedagem.checkIn, periodoValido);
export type AlterarHospedagem = z.output<typeof alterarHospedagemSchema>;

export const registrarPedidoDeHospedagemSchema = z.object({ hospedagemId: id, observacaoTime: textoOpcional(500) });
export type RegistrarPedidoDeHospedagem = z.output<typeof registrarPedidoDeHospedagemSchema>;

export const adicionarQuartoSchema = z.object({
  hospedagemId: id,
  nome: z.string().trim().min(1, "Dê um nome ao quarto.").max(40, "Use até 40 caracteres."),
  capacidade: z.coerce.number().int("Use um número inteiro.").min(1, "De 1 a 4 pessoas.").max(4, "De 1 a 4 pessoas."),
  sexo: z.enum(["F", "M"]).optional(),
  valorDiariaCentavos: dinheiro.optional(),
});
export type AdicionarQuarto = z.output<typeof adicionarQuartoSchema>;

export const removerQuartoSchema = z.object({ quartoId: id });
export const porNoQuartoSchema = z.object({ quartoId: id, convocacaoId: id });
export type PorNoQuarto = z.output<typeof porNoQuartoSchema>;
export const tirarDoQuartoSchema = z.object({ quartoId: id, convocacaoId: id });
export const aplicarRoomingSugeridoSchema = z.object({ eventoId: id });

export const criarCaronaSchema = z.object({ eventoId: id, motoristaConvocacaoId: id });
export type CriarCarona = z.output<typeof criarCaronaSchema>;
export const removerCaronaSchema = z.object({ caronaId: id });
export const definirCaronaSchema = z.object({ convocacaoId: id, caronaId: id });
export type DefinirCarona = z.output<typeof definirCaronaSchema>;
export const tirarDaCaronaSchema = z.object({ convocacaoId: id });
