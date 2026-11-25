import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { usuario } from "../core";
import { eventosSchema } from "./schemas";

// Quem é a SDC no sistema: a agência parceira que compra passagem e hotel. É gente de fora da empresa, então NÃO tem
// core.usuario nem perfil do GH: a líder cadastra aqui o e-mail da pessoa e ela entra com o Google. Só enxerga a área
// /sdc (pedidos de voo e de hospedagem). Desativar corta o acesso no próximo clique (lido a cada requisição).
export const acessoSdc = eventosSchema.table(
  "acesso_sdc",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    // Sempre em minúsculas e sem espaços: é comparado com o e-mail confirmado pelo provedor do login.
    email: text("email").notNull().unique(),
    nome: text("nome").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: uuid("criado_por").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("acesso_sdc_criado_por_idx").on(table.criadoPor),
    check("acesso_sdc_email_check", sql`${table.email} = lower(btrim(${table.email})) AND ${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' AND length(${table.email}) <= 254`),
    check("acesso_sdc_nome_check", sql`length(btrim(${table.nome})) BETWEEN 2 AND 120`),
  ],
);
