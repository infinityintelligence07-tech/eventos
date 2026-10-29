import { boolean, date, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Definições SOMENTE LEITURA de tabelas do schema core, que pertence ao GH-System.
// Este arquivo não entra no drizzle.config: nenhuma migration é gerada a partir dele.
// Mudança aqui exige PR no GH-System antes (docs/adr/0001-banco-pessoas-gh-eventos.md, regra 3).
const coreSchema = pgSchema("core");

export const usuario = coreSchema.table("usuario", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  nomeUsuario: text("nome_usuario"),
  telefone: text("telefone"),
  ativo: boolean("ativo").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const polo = coreSchema.table("polo", {
  id: uuid("id").primaryKey(),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  liderId: uuid("lider_id"),
  ativo: boolean("ativo").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const cargo = coreSchema.table("cargo", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  setorId: uuid("setor_id"),
  ativo: boolean("ativo").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Vínculo da pessoa com a IAM (tipo STAFF, CLT...; status ATIVO...). O polo do staff vem daqui.
// salario_ou_diaria e unidade_pagamento existem no GH e ficam de fora de propósito: o Eventos não lê remuneração.
export const vinculo = coreSchema.table("vinculo", {
  id: uuid("id").primaryKey(),
  pessoaId: uuid("pessoa_id").notNull(),
  tipo: text("tipo").notNull(),
  cargoId: uuid("cargo_id"),
  nivelId: uuid("nivel_id"),
  setorId: uuid("setor_id"),
  poloId: uuid("polo_id"),
  liderId: uuid("lider_id"),
  dataInicio: date("data_inicio").notNull(),
  dataFim: date("data_fim"),
  status: text("status").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const pessoa = coreSchema.table("pessoa", {
  id: uuid("id").primaryKey(),
  usuarioId: uuid("usuario_id"),
  nomeCompleto: text("nome_completo").notNull(),
  nomeSocial: text("nome_social"),
  dataNascimento: date("data_nascimento"),
  email: text("email"),
  telefone: text("telefone"),
  foto: text("foto"),
  ativo: boolean("ativo").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
