import { sql } from "drizzle-orm";
import { check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { usuario } from "../core";
import { eventosSchema } from "./schemas";

// Valores editáveis em Configurações (ex.: link_custos usado na copy de escalação).
// Valor vazio ou nulo = não configurado (a copy que depende dele fica bloqueada).
export const configuracao = eventosSchema.table(
  "configuracao",
  {
    chave: text("chave").primaryKey(),
    valor: text("valor"),
    atualizadoPor: uuid("atualizado_por").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("configuracao_atualizado_por_idx").on(table.atualizadoPor),
    check("configuracao_chave_check", sql`${table.chave} ~ '^[a-z][a-z0-9_]{1,59}$'`),
  ],
);
