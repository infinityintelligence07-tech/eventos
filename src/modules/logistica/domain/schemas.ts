import { z } from "zod";

import { DIAS_DO_AVISO_MAXIMO, DIAS_DO_AVISO_MINIMO } from "./janela";

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

/**
 * Pedido de voo como na planilha do time: evento + pessoa do staff, esteja ou não na escala (o pedido costuma vir
 * antes dela). `outraCompra` confirma que é uma compra a mais para quem já tem pedido ativo no evento.
 */
export const registrarPedidoDeVooSchema = z.object({
  eventoId: id,
  pessoaId: id,
  trechos: trechosDesejadosSchema,
  observacaoTime: textoOpcional(500),
  outraCompra: z.stringbool().optional(),
  /** "Também precisa de hotel": põe a pessoa na lista de quem precisa de hotel neste evento (caixa desmarcada = não vem). */
  precisaHotel: z.stringbool().optional(),
});
export type RegistrarPedidoDeVoo = z.output<typeof registrarPedidoDeVooSchema>;

/** Marca ou desmarca "Também precisa de hotel" num pedido de voo que já existe. */
export const definirHotelDoVooSchema = z.object({ pedidoId: id, precisaHotel: z.stringbool() });
export type DefinirHotelDoVoo = z.output<typeof definirHotelDoVooSchema>;

/** Hospedagem: acrescentar à lista de quem precisa de hotel (ou tirar quem foi acrescentado), sem escala nem voo. */
export const hospedeDoEventoSchema = z.object({ eventoId: id, pessoaId: id });
export type HospedeDoEvento = z.output<typeof hospedeDoEventoSchema>;

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

/** Hotel que a SDC reservou e que ainda não está em Locais e hotéis: o mínimo para cadastrar na hora. */
const novoHotelSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do hotel.").max(120, "Use até 120 caracteres."),
  cidade: z.string().trim().min(2, "Informe a cidade.").max(80, "Use até 80 caracteres."),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a sigla do estado (SP, AM...)."),
  logradouro: textoOpcional(160),
  numero: textoOpcional(20),
  bairro: textoOpcional(80),
});
export type NovoHotel = z.output<typeof novoHotelSchema>;

export const FORMA_DE_PAGAMENTO_PADRAO = "Faturado SDC";
/** Valor do seletor de hotel que abre os campos de "cadastrar outro hotel". */
export const NOVO_HOTEL = "novo";

/**
 * Retorno da SDC para a hospedagem: qual hotel ela reservou (um já cadastrado ou um novo, cadastrado na hora), número
 * da reserva, valor total e forma de pagamento.
 */
export const registrarRetornoDeHospedagemSchema = z
  .object({
    pedidoId: id,
    localId: z.preprocess((valor) => (valor === NOVO_HOTEL ? undefined : valor), id.optional()),
    novoHotel: novoHotelSchema.optional(),
    valorCentavos: dinheiro,
    numeroReserva: z.string().trim().min(1, "Informe o número da reserva.").max(60, "Use até 60 caracteres."),
    formaPagamento: z.string().trim().min(2, "Informe a forma de pagamento (ex.: Faturado SDC).").max(60, "Use até 60 caracteres."),
    observacaoSdc: textoOpcional(500),
  })
  .refine((retorno) => (retorno.localId === undefined) !== (retorno.novoHotel === undefined), {
    path: ["localId"],
    message: "Escolha o hotel que a SDC reservou ou cadastre um novo.",
  });
export type RegistrarRetornoDeHospedagem = z.output<typeof registrarRetornoDeHospedagemSchema>;

const periodoValido = { path: ["checkOut"], message: "O check-out precisa ser depois do check-in." };

/** `localId` vazio = hotel a definir pela SDC (o time monta os quartos e pede; o hotel vem no retorno). */
export const criarHospedagemSchema = z
  .object({ eventoId: id, localId: id.optional(), checkIn: data, checkOut: data, observacao: textoOpcional(500) })
  .refine((hospedagem) => hospedagem.checkOut > hospedagem.checkIn, periodoValido);
export type CriarHospedagem = z.output<typeof criarHospedagemSchema>;

export const alterarHospedagemSchema = z
  .object({
    hospedagemId: id,
    localId: id.optional(),
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

export const removerHospedagemSchema = z.object({ hospedagemId: id });
export const removerQuartoSchema = z.object({ quartoId: id });
export const porNoQuartoSchema = z.object({ quartoId: id, pessoaId: id });
export type PorNoQuarto = z.output<typeof porNoQuartoSchema>;
export const tirarDoQuartoSchema = z.object({ quartoId: id, pessoaId: id });
/** Duas pessoas trocam de lugar: `quartoId` é o quarto atual de `pessoaId`; `com…` são a outra pessoa e o quarto dela. */
export const trocarDeQuartoSchema = z.object({ quartoId: id, pessoaId: id, comQuartoId: id, comPessoaId: id });
export type TrocarDeQuarto = z.output<typeof trocarDeQuartoSchema>;

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const DESTINO_DO_OCUPANTE = new RegExp(`^(?:quarto:(${UUID})|troca:(${UUID}):(${UUID}))$`);

/** Valor do seletor "Mover para…": um quarto com vaga, ou a pessoa (e o quarto dela) com quem trocar de lugar. */
export const destinoNoQuarto = (quartoId: string) => `quarto:${quartoId}`;
export const destinoDaTroca = (quartoId: string, pessoaId: string) => `troca:${quartoId}:${pessoaId}`;

/**
 * "Mover para…" de quem já está num quarto: ir para outro quarto com vaga ou trocar de lugar com alguém de outro
 * quarto, as duas coisas em um passo.
 */
export const moverDeQuartoSchema = z
  .object({ quartoId: id, pessoaId: id, destino: z.string().regex(DESTINO_DO_OCUPANTE, "Escolha uma opção da lista.") })
  .transform(({ quartoId, pessoaId, destino }): { mover: PorNoQuarto } | { trocar: TrocarDeQuarto } => {
    const [, paraQuartoId, comQuartoId, comPessoaId] = DESTINO_DO_OCUPANTE.exec(destino)!;
    return paraQuartoId
      ? { mover: { quartoId: paraQuartoId.toLowerCase(), pessoaId } }
      : { trocar: { quartoId, pessoaId, comQuartoId: comQuartoId!.toLowerCase(), comPessoaId: comPessoaId!.toLowerCase() } };
  });
export type MoverDeQuarto = z.output<typeof moverDeQuartoSchema>;
/** Sem datas = volta a acompanhar o período da hospedagem. */
export const definirPeriodoDoOcupanteSchema = z
  .object({ quartoId: id, pessoaId: id, checkIn: data.optional(), checkOut: data.optional() })
  .refine((periodo) => (periodo.checkIn === undefined) === (periodo.checkOut === undefined), { path: ["checkOut"], message: "Informe o check-in e o check-out, ou deixe os dois em branco." })
  .refine((periodo) => !periodo.checkIn || !periodo.checkOut || periodo.checkOut > periodo.checkIn, periodoValido);
export type DefinirPeriodoDoOcupante = z.output<typeof definirPeriodoDoOcupanteSchema>;
export const aplicarRoomingSugeridoSchema = z.object({ eventoId: id });

const LIMITES_DO_AVISO = `Use de ${DIAS_DO_AVISO_MINIMO} a ${DIAS_DO_AVISO_MAXIMO} dias.`;

/** Configurações › Aviso de voos: quantos dias antes do evento o aviso de passagens a pedir começa. */
export const salvarAvisoDeVoosSchema = z.object({
  dias: z
    .string({ error: "Informe quantos dias antes do evento o aviso começa." })
    .trim()
    .regex(/^\d{1,4}$/, "Use um número inteiro de dias, sem vírgula.")
    .transform(Number)
    .pipe(z.number().min(DIAS_DO_AVISO_MINIMO, LIMITES_DO_AVISO).max(DIAS_DO_AVISO_MAXIMO, LIMITES_DO_AVISO)),
});
export type SalvarAvisoDeVoos = z.output<typeof salvarAvisoDeVoosSchema>;

/** "Aprovar pagamento": a caixa "Confirmo que usamos e que este valor pode ser pago" é obrigatória; a observação, não. */
export const aprovarPagamentoSchema = z.object({
  pedidoId: id,
  // O que o aprovador viu na tela: se a compra mudou depois disso (a SDC corrigiu o valor ou o voo), a aprovação é recusada.
  valorCentavos: z.coerce.number({ error: "Recarregue a página e confira a compra de novo." }).int().min(0),
  atualizadoEm: z.iso.datetime({ error: "Recarregue a página e confira a compra de novo." }),
  confirmo: z.stringbool({ error: "Marque a confirmação para aprovar." }).refine((valor) => valor, "Marque a confirmação para aprovar."),
  observacao: textoOpcional(500),
});
export type AprovarPagamento = z.output<typeof aprovarPagamentoSchema>;
export const desfazerAprovacaoSchema = z.object({ pedidoId: id });

// ---- Área da SDC (docs/09 §15). A SDC identifica o pedido pela referência (SDC-000123), nunca por id interno, e só
// registra ou corrige a compra de pedidos que já existem.

const referenciaDoPedido = z.string().regex(/^SDC-\d{6,12}$/, "Pedido inválido. Recarregue a página.");

/** Companhias da planilha do time. "Outra" abre um campo de texto (validado como os outros textos da SDC). */
export const COMPANHIAS_DA_SDC = ["Azul", "LATAM", "GOL"] as const;
export const OUTRA_COMPANHIA = "OUTRA";

/** Para o formulário de correção: a companhia gravada é uma da lista ou vai para "Outra". */
export function companhiaNoFormulario(companhia: string | null): { opcao: string; outra: string } {
  if (!companhia) return { opcao: "", outra: "" };
  const daLista = COMPANHIAS_DA_SDC.find((item) => item.toLowerCase() === companhia.trim().toLowerCase());
  return daLista ? { opcao: daLista, outra: "" } : { opcao: OUTRA_COMPANHIA, outra: companhia };
}

const MENSAGEM_SEM_LINK = "Não use links nem endereços de site neste campo.";
const MENSAGEM_SEM_QUEBRA = "Use uma linha só, sem quebras nem caracteres especiais de controle.";
const TEM_LINK = /:\/\/|www\./i;
// Caracteres de controle (inclui quebra de linha e tabulação): é exatamente o que se quer recusar.
const TEM_CONTROLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// Idem, menos quebra de linha e tabulação (texto de várias linhas).
const TEM_CONTROLE_FORA_QUEBRA = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Texto que a SDC digita e que o time repassa (copys para o staff, Locais e hotéis): uma linha só, sem link e sem
 * caractere de controle. Espaços repetidos viram um.
 */
const textoDaSdc = (minimo: number, maximo: number, mensagemDoMinimo: string) =>
  z
    .string()
    .max(maximo * 2, `Use até ${maximo} caracteres.`)
    .refine((texto) => !TEM_CONTROLE.test(texto.trim()), MENSAGEM_SEM_QUEBRA)
    .transform((texto) => texto.trim().replace(/ {2,}/g, " "))
    .pipe(z.string().min(minimo, mensagemDoMinimo).max(maximo, `Use até ${maximo} caracteres.`).refine((texto) => !TEM_LINK.test(texto), MENSAGEM_SEM_LINK));

const textoOpcionalDaSdc = (maximo: number) => z.preprocess((valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor), textoDaSdc(1, maximo, "Informe o texto.").optional());

/** Observação da SDC para o time: pode ter mais de uma linha, mas não link nem caractere de controle. */
const observacaoDaSdc = z
  .string()
  .trim()
  .max(500, "Use até 500 caracteres.")
  .refine((texto) => !TEM_CONTROLE_FORA_QUEBRA.test(texto), "Use só texto, sem caracteres especiais de controle.")
  .refine((texto) => !TEM_LINK.test(texto), MENSAGEM_SEM_LINK)
  .optional();

/**
 * O trecho que a SDC informa. Lista fechada: sentido, companhia, número do voo, localizador, partida e chegada.
 * NÃO tem o link do cartão de embarque (só o time põe link; o da SDC seria um link de terceiros na tela do time).
 */
const trechoCompradoPelaSdcSchema = z
  .object({
    sentido: z.enum(SENTIDOS),
    companhia: z.enum([...COMPANHIAS_DA_SDC, OUTRA_COMPANHIA], { error: "Escolha a companhia." }),
    outraCompanhia: textoOpcionalDaSdc(40),
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
  })
  .refine((trecho) => trecho.chegadaEm > trecho.partidaEm, { path: ["chegadaEm"], message: "A chegada precisa ser depois da partida." })
  .refine((trecho) => trecho.companhia !== OUTRA_COMPANHIA || (trecho.outraCompanhia ?? "").length >= 2, { path: ["outraCompanhia"], message: "Informe o nome da companhia." })
  .transform(({ sentido, companhia, outraCompanhia, numeroVoo, localizador, partidaEm, chegadaEm }) => ({
    sentido,
    companhia: companhia === OUTRA_COMPANHIA ? outraCompanhia! : companhia,
    numeroVoo,
    localizador,
    partidaEm,
    chegadaEm,
  }));

export const registrarCompraDeVooPelaSdcSchema = z.object({
  referencia: referenciaDoPedido,
  valorCentavos: dinheiro,
  observacaoSdc: observacaoDaSdc,
  trechos: z
    .array(trechoCompradoPelaSdcSchema)
    .min(1, "Informe pelo menos um trecho.")
    .max(2)
    .refine((trechos) => new Set(trechos.map((trecho) => trecho.sentido)).size === trechos.length, "Cada sentido aparece uma vez só."),
});
export type RegistrarCompraDeVooPelaSdc = z.output<typeof registrarCompraDeVooPelaSdcSchema>;

/** O hotel como a SDC informa (ela não vê a lista de locais do time): nome, cidade e UF, e o endereço se quiser. */
const hotelDaSdcSchema = z.object({
  nome: textoDaSdc(2, 120, "Informe o nome do hotel."),
  cidade: textoDaSdc(2, 80, "Informe a cidade."),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a sigla do estado (SP, AM...)."),
  logradouro: textoOpcionalDaSdc(160),
  numero: textoOpcionalDaSdc(20),
  bairro: textoOpcionalDaSdc(80),
});

export const registrarReservaPelaSdcSchema = z.object({
  referencia: referenciaDoPedido,
  hotel: hotelDaSdcSchema,
  valorCentavos: dinheiro,
  numeroReserva: textoDaSdc(1, 60, "Informe o número da reserva."),
  formaPagamento: textoDaSdc(2, 60, "Informe a forma de pagamento (ex.: Faturado SDC)."),
  observacaoSdc: observacaoDaSdc,
});
export type RegistrarReservaPelaSdc = z.output<typeof registrarReservaPelaSdcSchema>;

// ---- Configurações › Acesso da SDC: a lista de e-mails da agência, mantida pela líder.

export const incluirAcessoDaSdcSchema = z.object({
  email: z
    .string({ error: "Informe o e-mail." })
    .trim()
    .toLowerCase()
    .max(254, "E-mail longo demais.")
    .pipe(z.email("Informe um e-mail válido.")),
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "Informe o nome da pessoa.").max(120, "Use até 120 caracteres."),
});
export type IncluirAcessoDaSdc = z.output<typeof incluirAcessoDaSdcSchema>;

export const definirAcessoDaSdcSchema = z.object({ acessoSdcId: id, ativo: z.stringbool() });
export type DefinirAcessoDaSdc = z.output<typeof definirAcessoDaSdcSchema>;

export const ITENS_DISPENSAVEIS = ["VOO", "HOSPEDAGEM"] as const;
export type ItemDispensavel = (typeof ITENS_DISPENSAVEIS)[number];

/** O time marca que o evento não precisa de voo (ou não tem hospedagem) e ele sai dos pendentes; `dispensar` falso desfaz. */
export const dispensarLogisticaDoEventoSchema = z.object({ eventoId: id, item: z.enum(ITENS_DISPENSAVEIS), dispensar: z.stringbool() });
export type DispensarLogisticaDoEvento = z.output<typeof dispensarLogisticaDoEventoSchema>;

export const criarCaronaSchema = z.object({ eventoId: id, motoristaConvocacaoId: id });
export type CriarCarona = z.output<typeof criarCaronaSchema>;
export const removerCaronaSchema = z.object({ caronaId: id });
export const definirCaronaSchema = z.object({ convocacaoId: id, caronaId: id });
export type DefinirCarona = z.output<typeof definirCaronaSchema>;
export const tirarDaCaronaSchema = z.object({ convocacaoId: id });
