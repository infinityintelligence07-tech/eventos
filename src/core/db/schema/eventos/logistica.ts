import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { pessoa, usuario } from "../core";
import { local } from "./cadastros";
import { convocacao, evento } from "./evento";
import { eventosSchema } from "./schemas";

// Pedidos à SDC (agência): voo de um passageiro (ida e/ou volta) ou reserva de hotel.
// Uma numeração para os dois, SDC-000001, que a fatura da SDC vai citar.
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
    situacao: text("situacao").notNull().default("PEDIDO"),
    valorCentavos: integer("valor_centavos"),
    observacaoTime: text("observacao_time"),
    observacaoSdc: text("observacao_sdc"),
    solicitadoPor: uuid("solicitado_por").references(() => usuario.id, { onDelete: "set null" }),
    solicitadoEm: timestamp("solicitado_em", { withTimezone: true }).notNull().defaultNow(),
    // Em ALTERADO fica o emitido_em da emissão anterior.
    emitidoEm: timestamp("emitido_em", { withTimezone: true }),
    retornoRegistradoPor: uuid("retorno_registrado_por").references(() => usuario.id, { onDelete: "set null" }),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    canceladoPor: uuid("cancelado_por").references(() => usuario.id, { onDelete: "set null" }),
    motivoCancelamento: text("motivo_cancelamento"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pedido_sdc_evento_idx").on(table.eventoId),
    index("pedido_sdc_pessoa_idx").on(table.pessoaId),
    index("pedido_sdc_convocacao_idx").on(table.convocacaoId),
    index("pedido_sdc_solicitado_por_idx").on(table.solicitadoPor),
    index("pedido_sdc_retorno_registrado_por_idx").on(table.retornoRegistradoPor),
    index("pedido_sdc_cancelado_por_idx").on(table.canceladoPor),
    index("pedido_sdc_situacao_idx").on(table.situacao),
    // Um pedido de voo ativo por pessoa por evento.
    uniqueIndex("pedido_sdc_voo_ativo_unique")
      .on(table.eventoId, table.pessoaId)
      .where(sql`${table.tipo} = 'VOO' AND ${table.situacao} <> 'CANCELADO'`),
    check("pedido_sdc_referencia_check", sql`${table.referencia} ~ '^SDC-[0-9]{6,}$'`),
    check("pedido_sdc_tipo_check", sql`${table.tipo} IN ('VOO', 'HOSPEDAGEM')`),
    check("pedido_sdc_passageiro_check", sql`(${table.tipo} = 'VOO') = (${table.pessoaId} IS NOT NULL)`),
    check("pedido_sdc_situacao_check", sql`${table.situacao} IN ('PEDIDO', 'EMITIDO', 'ALTERADO', 'CANCELADO')`),
    check("pedido_sdc_valor_check", sql`${table.valorCentavos} IS NULL OR ${table.valorCentavos} >= 0`),
    check("pedido_sdc_emitido_check", sql`${table.situacao} <> 'EMITIDO' OR ${table.emitidoEm} IS NOT NULL`),
    check("pedido_sdc_cancelado_check", sql`(${table.situacao} = 'CANCELADO') = (${table.canceladoEm} IS NOT NULL)`),
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
    origemIata: text("origem_iata").notNull(),
    destinoIata: text("destino_iata").notNull(),
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
    check(
      "trecho_voo_iata_check",
      sql`${table.origemIata} ~ '^[A-Z]{3}$' AND ${table.destinoIata} ~ '^[A-Z]{3}$' AND ${table.origemIata} <> ${table.destinoIata}`,
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

// Onde a equipe dorme num evento: hotel pela SDC (com pedido) ou apartamento da IAM (sem pedido).
export const hospedagem = eventosSchema.table(
  "hospedagem",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    localId: uuid("local_id")
      .notNull()
      .references(() => local.id, { onDelete: "restrict" }),
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

export const quartoOcupante = eventosSchema.table(
  "quarto_ocupante",
  {
    quartoId: uuid("quarto_id")
      .notNull()
      .references(() => quarto.id, { onDelete: "cascade" }),
    // Uma cama por convocação.
    convocacaoId: uuid("convocacao_id")
      .notNull()
      .unique()
      .references(() => convocacao.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.quartoId, table.convocacaoId] })],
);
