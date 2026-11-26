import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { pessoa, usuario } from "../core";
import { acessoSdc } from "./acesso-sdc";
import { local } from "./cadastros";
import { convocacao, evento } from "./evento";
import { eventosSchema } from "./schemas";

// Pedidos à SDC (agência): voo de um passageiro (ida e/ou volta) ou reserva de hotel. Nós solicitamos, a SDC compra
// e o time registra o retorno. Uma numeração para os dois, SDC-000001, que a fatura da SDC vai citar.
// O pedido de voo é da pessoa no evento (evento_id + pessoa_id) e pode vir antes da escala: convocacao_id é um vínculo
// opcional. A mesma pessoa pode ter mais de um pedido ativo no mesmo evento (ida e volta + um trecho a mais).
export const pedidoSdcReferenciaSeq = eventosSchema.sequence("pedido_sdc_referencia_seq");

export const pedidoSdc = eventosSchema.table(
  "pedido_sdc",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    referencia: text("referencia")
      .notNull()
      .unique()
      .default(sql`'SDC-' || lpad(nextval('eventos.pedido_sdc_referencia_seq')::text, 6, '0')`),
    tipo: text("tipo").notNull(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    // Passageiro: obrigatório no voo, vazio na hospedagem.
    pessoaId: uuid("pessoa_id").references(() => pessoa.id, { onDelete: "restrict" }),
    convocacaoId: uuid("convocacao_id").references(() => convocacao.id, { onDelete: "set null" }),
    // Só no voo de Masterclass: a viagem é uma turnê. O pedido é da primeira palestra (evento_id, onde a ida chega) e
    // este é o evento da última, de onde a volta sai. Vazio = ida e volta pelo mesmo evento.
    eventoVoltaId: uuid("evento_volta_id").references(() => evento.id, { onDelete: "restrict" }),
    // Só no voo: "também precisa de hotel". Põe o passageiro na lista de quem precisa de hotel do evento (uma das três
    // origens, com a escala e o acréscimo direto na Hospedagem), enquanto o pedido não for cancelado.
    precisaHotel: boolean("precisa_hotel").notNull().default(false),
    situacao: text("situacao").notNull().default("PEDIDO"),
    valorCentavos: integer("valor_centavos"),
    observacaoTime: text("observacao_time"),
    observacaoSdc: text("observacao_sdc"),
    solicitadoPor: uuid("solicitado_por").references(() => usuario.id, { onDelete: "set null" }),
    solicitadoEm: timestamp("solicitado_em", { withTimezone: true }).notNull().defaultNow(),
    // Datas de negócio, informadas pelo time (compra antiga da planilha, compra feita fora do sistema): o dia em que o
    // pedido foi feito à SDC e o dia em que ela comprou. Por padrão, o dia do lançamento. Os instantes (solicitado_em,
    // emitido_em) e o histórico continuam com a hora real em que foi lançado no sistema.
    dataSolicitacao: date("data_solicitacao")
      .notNull()
      .default(sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`),
    dataCompra: date("data_compra"),
    // Em ALTERADO fica o emitido_em da emissão anterior.
    emitidoEm: timestamp("emitido_em", { withTimezone: true }),
    // Quem lançou a compra: alguém do time em nome da SDC (retorno_registrado_por) ou a própria SDC, pela área dela.
    retornoRegistradoPor: uuid("retorno_registrado_por").references(() => usuario.id, { onDelete: "set null" }),
    retornoRegistradoPelaSdc: uuid("retorno_registrado_pela_sdc").references(() => acessoSdc.id, { onDelete: "restrict" }),
    // Aprovação do pagamento pelo time, depois da compra: "usamos e este valor pode ser pago". Cai se a compra muda.
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    aprovadoPor: uuid("aprovado_por").references(() => usuario.id, { onDelete: "set null" }),
    observacaoAprovacao: text("observacao_aprovacao"),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    canceladoPor: uuid("cancelado_por").references(() => usuario.id, { onDelete: "set null" }),
    motivoCancelamento: text("motivo_cancelamento"),
    // Como a compra foi paga, informado no retorno da SDC (ex.: "Faturado SDC"). Hoje só a hospedagem preenche.
    formaPagamento: text("forma_pagamento"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pedido_sdc_evento_idx").on(table.eventoId),
    index("pedido_sdc_pessoa_idx").on(table.pessoaId),
    index("pedido_sdc_convocacao_idx").on(table.convocacaoId),
    index("pedido_sdc_evento_volta_idx").on(table.eventoVoltaId),
    index("pedido_sdc_solicitado_por_idx").on(table.solicitadoPor),
    index("pedido_sdc_retorno_registrado_por_idx").on(table.retornoRegistradoPor),
    index("pedido_sdc_retorno_pela_sdc_idx").on(table.retornoRegistradoPelaSdc),
    index("pedido_sdc_aprovado_por_idx").on(table.aprovadoPor),
    index("pedido_sdc_cancelado_por_idx").on(table.canceladoPor),
    index("pedido_sdc_situacao_idx").on(table.situacao),
    check("pedido_sdc_referencia_check", sql`${table.referencia} ~ '^SDC-[0-9]{6,}$'`),
    check("pedido_sdc_tipo_check", sql`${table.tipo} IN ('VOO', 'HOSPEDAGEM')`),
    check("pedido_sdc_passageiro_check", sql`(${table.tipo} = 'VOO') = (${table.pessoaId} IS NOT NULL)`),
    check("pedido_sdc_situacao_check", sql`${table.situacao} IN ('PEDIDO', 'EMITIDO', 'ALTERADO', 'CANCELADO')`),
    check("pedido_sdc_valor_check", sql`${table.valorCentavos} IS NULL OR ${table.valorCentavos} >= 0`),
    check("pedido_sdc_emitido_check", sql`${table.situacao} <> 'EMITIDO' OR ${table.emitidoEm} IS NOT NULL`),
    check("pedido_sdc_cancelado_check", sql`(${table.situacao} = 'CANCELADO') = (${table.canceladoEm} IS NOT NULL)`),
    // Só se aprova compra registrada (EMITIDO) e com valor; sair de EMITIDO derruba a aprovação.
    check("pedido_sdc_aprovacao_check", sql`${table.aprovadoEm} IS NULL OR (${table.situacao} = 'EMITIDO' AND ${table.valorCentavos} IS NOT NULL)`),
    check("pedido_sdc_aprovacao_obs_check", sql`${table.observacaoAprovacao} IS NULL OR (${table.aprovadoEm} IS NOT NULL AND length(${table.observacaoAprovacao}) <= 500)`),
    // A compra é de um autor só: alguém do time (em nome da SDC) OU a própria SDC; nunca os dois.
    check("pedido_sdc_retorno_autor_check", sql`${table.retornoRegistradoPor} IS NULL OR ${table.retornoRegistradoPelaSdc} IS NULL`),
    // A turnê (evento da volta) só existe no voo, e a volta é de outra palestra (a mesma = vazio).
    check("pedido_sdc_evento_volta_check", sql`${table.eventoVoltaId} IS NULL OR (${table.tipo} = 'VOO' AND ${table.eventoVoltaId} <> ${table.eventoId})`),
    // A compra não acontece antes do pedido.
    check("pedido_sdc_data_compra_check", sql`${table.dataCompra} IS NULL OR ${table.dataCompra} >= ${table.dataSolicitacao}`),
    check("pedido_sdc_forma_pagamento_check", sql`${table.formaPagamento} IS NULL OR length(${table.formaPagamento}) BETWEEN 1 AND 60`),
  ],
);

export const trechoVoo = eventosSchema.table(
  "trecho_voo",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidoSdc.id, { onDelete: "cascade" }),
    sentido: text("sentido").notNull(),
    // O time pede por cidade ("Porto Alegre (RS)"): de onde a pessoa sai e a cidade do evento. Quem escolhe o aeroporto
    // é a SDC, que informa o código (3 letras) ao registrar a compra. Trecho anterior à 0020 só tem o aeroporto.
    origemCidade: text("origem_cidade"),
    destinoCidade: text("destino_cidade"),
    origemIata: text("origem_iata"),
    destinoIata: text("destino_iata"),
    dataDesejada: date("data_desejada").notNull(),
    preferenciaHorario: text("preferencia_horario"),
    // Preenchidos pela SDC na emissão.
    companhia: text("companhia"),
    numeroVoo: text("numero_voo"),
    localizador: text("localizador"),
    partidaEm: timestamp("partida_em", { withTimezone: true }),
    chegadaEm: timestamp("chegada_em", { withTimezone: true }),
    cartaoEmbarqueUrl: text("cartao_embarque_url"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("trecho_voo_pedido_sentido_unique").on(table.pedidoId, table.sentido),
    check("trecho_voo_sentido_check", sql`${table.sentido} IN ('IDA', 'VOLTA')`),
    // Aeroporto é opcional; quando vem, são 3 letras, e os dois de um trecho não podem ser o mesmo.
    check(
      "trecho_voo_iata_check",
      sql`(${table.origemIata} IS NULL OR ${table.origemIata} ~ '^[A-Z]{3}$') AND (${table.destinoIata} IS NULL OR ${table.destinoIata} ~ '^[A-Z]{3}$') AND (${table.origemIata} IS NULL OR ${table.destinoIata} IS NULL OR ${table.origemIata} <> ${table.destinoIata})`,
    ),
    // Cada ponta do trecho tem a cidade ou o aeroporto: não existe trecho sem saber de onde sai ou aonde chega.
    check(
      "trecho_voo_pontas_check",
      sql`(${table.origemCidade} IS NOT NULL OR ${table.origemIata} IS NOT NULL) AND (${table.destinoCidade} IS NOT NULL OR ${table.destinoIata} IS NOT NULL)`,
    ),
    check(
      "trecho_voo_cidade_check",
      sql`(${table.origemCidade} IS NULL OR length(${table.origemCidade}) BETWEEN 2 AND 80) AND (${table.destinoCidade} IS NULL OR length(${table.destinoCidade}) BETWEEN 2 AND 80)`,
    ),
    check(
      "trecho_voo_preferencia_check",
      sql`${table.preferenciaHorario} IS NULL OR ${table.preferenciaHorario} IN ('MANHA', 'TARDE', 'NOITE', 'QUALQUER')`,
    ),
    check("trecho_voo_numero_check", sql`${table.numeroVoo} IS NULL OR ${table.numeroVoo} ~ '^[A-Z0-9]{2}[0-9]{1,4}$'`),
    check("trecho_voo_localizador_check", sql`${table.localizador} IS NULL OR ${table.localizador} ~ '^[A-Z0-9]{5,8}$'`),
    check(
      "trecho_voo_horario_check",
      sql`${table.partidaEm} IS NULL OR ${table.chegadaEm} IS NULL OR ${table.chegadaEm} > ${table.partidaEm}`,
    ),
    check(
      "trecho_voo_cartao_check",
      sql`${table.cartaoEmbarqueUrl} IS NULL OR ${table.cartaoEmbarqueUrl} ~ '^https://'`,
    ),
  ],
);

// Onde a equipe dorme num evento. O time monta os quartos primeiro; quem escolhe e reserva o hotel é a SDC, então
// local_id fica vazio até o retorno do pedido (ou é o apartamento da IAM, que não passa pela SDC).
export const hospedagem = eventosSchema.table(
  "hospedagem",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    localId: uuid("local_id").references(() => local.id, { onDelete: "restrict" }),
    pedidoId: uuid("pedido_id")
      .unique()
      .references(() => pedidoSdc.id, { onDelete: "restrict" }),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    numeroReserva: text("numero_reserva"),
    observacao: text("observacao"),
    criadoPor: uuid("criado_por").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hospedagem_evento_idx").on(table.eventoId),
    index("hospedagem_local_idx").on(table.localId),
    index("hospedagem_criado_por_idx").on(table.criadoPor),
    check("hospedagem_periodo_check", sql`${table.checkOut} > ${table.checkIn}`),
  ],
);

// Rooming list.
export const quarto = eventosSchema.table(
  "quarto",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    hospedagemId: uuid("hospedagem_id")
      .notNull()
      .references(() => hospedagem.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    capacidade: smallint("capacidade").notNull(),
    // Nulo = misto/família.
    sexo: text("sexo"),
    valorDiariaCentavos: integer("valor_diaria_centavos"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("quarto_hospedagem_nome_unique").on(table.hospedagemId, table.nome),
    check("quarto_capacidade_check", sql`${table.capacidade} BETWEEN 1 AND 4`),
    check("quarto_sexo_check", sql`${table.sexo} IS NULL OR ${table.sexo} IN ('F', 'M')`),
    check("quarto_valor_check", sql`${table.valorDiariaCentavos} IS NULL OR ${table.valorDiariaCentavos} >= 0`),
  ],
);

// Uma cama por pessoa no evento. O ocupante é a PESSOA (o hotel é pedido à SDC antes de a escala existir); a convocação
// é só um vínculo, preenchido quando a pessoa está na escala. evento_id repete o do quarto (quarto → hospedagem) para
// o banco garantir "uma cama por pessoa por evento".
export const quartoOcupante = eventosSchema.table(
  "quarto_ocupante",
  {
    quartoId: uuid("quarto_id")
      .notNull()
      .references(() => quarto.id, { onDelete: "cascade" }),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "restrict" }),
    // Sair da escala não tira ninguém do quarto: o vínculo só fica vazio.
    convocacaoId: uuid("convocacao_id")
      .unique()
      .references(() => convocacao.id, { onDelete: "set null" }),
    // Período da pessoa quando difere do da hospedagem (chega depois ou sai antes). Nulo = o da hospedagem.
    checkIn: date("check_in"),
    checkOut: date("check_out"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.quartoId, table.pessoaId] }),
    unique("quarto_ocupante_evento_pessoa_unique").on(table.eventoId, table.pessoaId),
    index("quarto_ocupante_pessoa_idx").on(table.pessoaId),
    check(
      "quarto_ocupante_periodo_check",
      sql`(${table.checkIn} IS NULL) = (${table.checkOut} IS NULL) AND (${table.checkIn} IS NULL OR ${table.checkOut} > ${table.checkIn})`,
    ),
  ],
);

// Quem precisa de hotel num evento sem depender da escala nem de pedido de voo: a pessoa foi acrescentada direto na
// tela de Hospedagem. As outras duas origens ficam onde nascem (convocacao.precisa_hotel e pedido_sdc.precisa_hotel).
export const hospedagemPessoa = eventosSchema.table(
  "hospedagem_pessoa",
  {
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "restrict" }),
    criadoPor: uuid("criado_por").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.eventoId, table.pessoaId] }), index("hospedagem_pessoa_pessoa_idx").on(table.pessoaId), index("hospedagem_pessoa_criado_por_idx").on(table.criadoPor)],
);
