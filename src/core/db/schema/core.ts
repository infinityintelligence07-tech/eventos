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
