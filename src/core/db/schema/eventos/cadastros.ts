import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { eventosSchema } from "./schemas";

// Tipo de evento (IPR/ASM, CONF, MG, LIB, MC...) com a regra que gera as vagas.
// regra_vagas: { "funcoes": [{ "funcao": "STAFF_LIDER", "formula": "ceil(expectativa_publico * 0.5 / 25)" }, { "funcao": "DJ", "fixo": 1 }] }
export const tipoEvento = eventosSchema.table(
  "tipo_evento",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    sigla: text("sigla").notNull().unique(),
    nome: text("nome").notNull(),
    dias: integer("dias"),
    regraVagas: jsonb("regra_vagas").notNull().default(sql`'{}'::jsonb`),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("tipo_evento_sigla_check", sql`${table.sigla} ~ '^[A-Z0-9_]{2,20}$'`),
    check("tipo_evento_dias_check", sql`${table.dias} IS NULL OR ${table.dias} > 0`),
  ],
);

// Função que a pessoa exerce num evento (staff, staff líder, DJ, palco, pai/mãe...).
export const funcao = eventosSchema.table(
  "funcao",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    codigo: text("codigo").notNull().unique(),
    nome: text("nome").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("funcao_codigo_check", sql`${table.codigo} ~ '^[A-Z0-9_]{2,30}$'`)],
);

// Local do evento ou hotel, cadastrado uma vez e reaproveitado.
export const local = eventosSchema.table(
  "local",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    nome: text("nome").notNull(),
    tipo: text("tipo").notNull().default("EVENTO"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    cidade: text("cidade").notNull(),
    uf: text("uf").notNull(),
    cep: text("cep"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    capacidade: integer("capacidade"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    check("local_tipo_check", sql`${table.tipo} IN ('EVENTO', 'HOTEL', 'APARTAMENTO')`),
    check("local_uf_check", sql`${table.uf} ~ '^[A-Z]{2}$'`),
    check("local_capacidade_check", sql`${table.capacidade} IS NULL OR ${table.capacidade} > 0`),
    index("local_cidade_idx").on(table.uf, table.cidade),
  ],
);

