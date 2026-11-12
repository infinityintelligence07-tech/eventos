import { sql } from "drizzle-orm";
import { check, text, timestamp } from "drizzle-orm/pg-core";

import { eventosSchema } from "./schemas";

// Qual código cada processo sem endereço público está rodando (hoje só o worker). Ele grava ao subir;
// a rota /api/versao lê, para o deploy conferir que o worker também foi publicado.
export const processo = eventosSchema.table(
  "processo",
  {
    nome: text("nome").primaryKey(),
    versao: text("versao").notNull(),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("processo_nome_check", sql`${table.nome} ~ '^[a-z][a-z0-9_-]{1,39}$'`)],
);
