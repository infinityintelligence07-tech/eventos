import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { pessoa, usuario } from "../core";
import { evento } from "./evento";
import { eventosSchema } from "./schemas";

// Enquete de disponibilidade por período ("eventos de janeiro"): substitui perguntar um a um no WhatsApp.
export const enquete = eventosSchema.table(
  "enquete",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    titulo: text("titulo").notNull(),
    fechaEm: timestamp("fecha_em", { withTimezone: true }).notNull(),
    criadoPor: uuid("criado_por").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("enquete_criado_por_idx").on(table.criadoPor)],
);

export const enqueteEvento = eventosSchema.table(
  "enquete_evento",
  {
    enqueteId: uuid("enquete_id")
      .notNull()
      .references(() => enquete.id, { onDelete: "cascade" }),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.enqueteId, table.eventoId] }),
    index("enquete_evento_evento_idx").on(table.eventoId),
  ],
);

export const disponibilidade = eventosSchema.table(
  "disponibilidade",
  {
    enqueteId: uuid("enquete_id").notNull(),
    eventoId: uuid("evento_id").notNull(),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "cascade" }),
    disponivel: boolean("disponivel").notNull(),
    respondidoEm: timestamp("respondido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventoId, table.pessoaId] }),
    foreignKey({
      name: "disponibilidade_enquete_evento_fk",
      columns: [table.enqueteId, table.eventoId],
      foreignColumns: [enqueteEvento.enqueteId, enqueteEvento.eventoId],
    }).onDelete("cascade"),
    index("disponibilidade_pessoa_idx").on(table.pessoaId),
    index("disponibilidade_enquete_evento_idx").on(table.enqueteId, table.eventoId),
  ],
);
