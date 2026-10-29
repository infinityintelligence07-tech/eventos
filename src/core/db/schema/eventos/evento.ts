import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { cargo, pessoa, polo, usuario } from "../core";
import { funcao, local, tipoEvento } from "./cadastros";
import { eventosSchema } from "./schemas";

// evento, escala, convocacao e presenca foram criadas pelo GH-System e adotadas pelo Eventos
// (ADR 0001, regra 5). As colunas novas são opcionais ou têm padrão, para o GH continuar funcionando.

export const evento = eventosSchema.table(
  "evento",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    poloId: uuid("polo_id").references(() => polo.id, { onDelete: "set null" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    tipoEventoId: uuid("tipo_evento_id").references(() => tipoEvento.id, { onDelete: "set null" }),
    // SIGLA_POLO_EDICAO, ex.: ASM_POA_234. Nulo em eventos criados pelo GH antes da adoção.
    codigo: text("codigo").unique(),
    edicao: text("edicao"),
    iamControlTurmaId: bigint("iam_control_turma_id", { mode: "number" }).unique(),
    localId: uuid("local_id").references(() => local.id, { onDelete: "set null" }),
    expectativaPublico: integer("expectativa_publico"),
    // Confronto: base do cálculo de pai/mãe (fila ÷ 15).
    pessoasNaFila: integer("pessoas_na_fila"),
    statusEscala: text("status_escala").notNull().default("SEM_ESCALA"),
    aprovadoPor: uuid("aprovado_por").references((): AnyPgColumn => usuario.id, {
      onDelete: "set null",
    }),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("evento_polo_idx").on(table.poloId),
    index("evento_inicio_idx").on(table.inicio),
    index("evento_status_idx").on(table.status),
    index("evento_tipo_idx").on(table.tipoEventoId),
    index("evento_local_idx").on(table.localId),
    index("evento_aprovado_por_idx").on(table.aprovadoPor),
    check(
      "evento_status_escala_check",
      sql`${table.statusEscala} IN ('SEM_ESCALA', 'RASCUNHO', 'AGUARDANDO_APROVACAO', 'DEVOLVIDA', 'APROVADA', 'COMUNICADA')`,
    ),
    check(
      "evento_aprovacao_check",
      sql`(${table.statusEscala} IN ('APROVADA', 'COMUNICADA')) = (${table.aprovadoEm} IS NOT NULL)`,
    ),
    check(
      "evento_publico_check",
      sql`(${table.expectativaPublico} IS NULL OR ${table.expectativaPublico} >= 0) AND (${table.pessoasNaFila} IS NULL OR ${table.pessoasNaFila} >= 0)`,
    ),
  ],
);

export const escala = eventosSchema.table(
  "escala",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "cascade" }),
    cargoId: uuid("cargo_id").references(() => cargo.id, { onDelete: "set null" }),
    data: date("data").notNull(),
    horaInicio: text("hora_inicio").notNull(),
    horaFim: text("hora_fim").notNull(),
    quantidadeVagas: integer("quantidade_vagas").notNull(),
    status: text("status").notNull(),
    funcaoId: uuid("funcao_id").references(() => funcao.id, { onDelete: "set null" }),
    // REGRA: gerada pela regra do tipo de evento; MANUAL: criada ou ajustada pelo time.
    origem: text("origem").notNull().default("MANUAL"),
    // Número de vagas conferido por quem monta a escala (pré-condição para enviar à aprovação).
    confirmadaEm: timestamp("confirmada_em", { withTimezone: true }),
    confirmadaPor: uuid("confirmada_por").references((): AnyPgColumn => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("escala_evento_idx").on(table.eventoId),
    index("escala_data_idx").on(table.data),
    index("escala_status_idx").on(table.status),
    index("escala_funcao_idx").on(table.funcaoId),
    index("escala_cargo_idx").on(table.cargoId),
    index("escala_confirmada_por_idx").on(table.confirmadaPor),
    check("escala_origem_check", sql`${table.origem} IN ('REGRA', 'MANUAL')`),
    check("escala_confirmada_check", sql`${table.confirmadaPor} IS NULL OR ${table.confirmadaEm} IS NOT NULL`),
  ],
);

export const convocacao = eventosSchema.table(
  "convocacao",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    escalaId: uuid("escala_id")
      .notNull()
      .references(() => escala.id, { onDelete: "cascade" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "cascade" }),
    // GH usa ACEITA/RECUSADA; o Eventos acrescenta SUGERIDA, CONVIDADA e CANCELADA.
    // Ativa (ocupa a vaga): SUGERIDA, CONVIDADA, ACEITA.
    status: text("status").notNull(),
    respondidaEm: timestamp("respondida_em", { withTimezone: true }),
    convidadaEm: timestamp("convidada_em", { withTimezone: true }),
    motivoRecusa: text("motivo_recusa"),
    deslocamento: text("deslocamento"),
    caronaId: uuid("carona_id").references((): AnyPgColumn => carona.id, { onDelete: "set null" }),
    distanciaKm: numeric("distancia_km", { precision: 7, scale: 1 }),
    tempoTrajetoMin: integer("tempo_trajeto_min"),
    montagem: boolean("montagem").notNull().default(false),
    observacao: text("observacao"),
    // Por que o sistema sugeriu a pessoa (distância, rodízio, disponibilidade).
    sugestaoScore: numeric("sugestao_score", { precision: 6, scale: 2 }),
    criadoPor: uuid("criado_por").references((): AnyPgColumn => usuario.id, { onDelete: "set null" }),
    // Preenchido = resposta registrada pelo time em nome da pessoa; nulo = a própria pessoa (portal futuro).
    registradoPor: uuid("registrado_por").references((): AnyPgColumn => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("convocacao_escala_pessoa_unique").on(table.escalaId, table.pessoaId),
    index("convocacao_escala_idx").on(table.escalaId),
    index("convocacao_pessoa_idx").on(table.pessoaId),
    index("convocacao_status_idx").on(table.status),
    index("convocacao_carona_idx").on(table.caronaId),
    index("convocacao_criado_por_idx").on(table.criadoPor),
    index("convocacao_registrado_por_idx").on(table.registradoPor),
    check(
      "convocacao_deslocamento_check",
      sql`${table.deslocamento} IS NULL OR ${table.deslocamento} IN ('CARRO_PROPRIO', 'CARONA', 'CARRO_IAM', 'UBER', 'ONIBUS', 'VOO', 'NAO_SE_APLICA')`,
    ),
    check(
      "convocacao_status_check",
      sql`${table.status} IN ('SUGERIDA', 'CONVIDADA', 'ACEITA', 'RECUSADA', 'CANCELADA')`,
    ),
  ],
);

export const presenca = eventosSchema.table(
  "presenca",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    convocacaoId: uuid("convocacao_id")
      .notNull()
      .unique()
      .references(() => convocacao.id, { onDelete: "cascade" }),
    entrada: timestamp("entrada", { withTimezone: true }),
    saida: timestamp("saida", { withTimezone: true }),
    status: text("status").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("presenca_status_idx").on(table.status)],
);

// Carro de um staff que leva outros ao evento (substitui a cor cinza e o "Carro N" da planilha).
export const carona = eventosSchema.table(
  "carona",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "cascade" }),
    motoristaPessoaId: uuid("motorista_pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "cascade" }),
    distanciaKm: numeric("distancia_km", { precision: 7, scale: 1 }),
    tempoTrajetoMin: integer("tempo_trajeto_min"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("carona_evento_motorista_unique").on(table.eventoId, table.motoristaPessoaId),
    index("carona_motorista_idx").on(table.motoristaPessoaId),
  ],
);
