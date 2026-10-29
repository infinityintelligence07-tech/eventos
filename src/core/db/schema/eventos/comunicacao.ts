import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { usuario } from "../core";
import { convocacao } from "./evento";
import { eventosSchema } from "./schemas";

// Modelo de copy com variáveis {{evento.cidade}}, {{pessoa.funcao}}... (escalação, hospedagem).
export const modeloCopy = eventosSchema.table(
  "modelo_copy",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    tipo: text("tipo").notNull(),
    nome: text("nome").notNull(),
    corpo: text("corpo").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Um modelo ativo por tipo: para trocar, desative o atual antes de ativar o outro (mesma transação).
    uniqueIndex("modelo_copy_ativo_unique").on(table.tipo).where(sql`${table.ativo}`),
    check(
      "modelo_copy_tipo_check",
      sql`${table.tipo} IN ('ESCALACAO', 'HOSPEDAGEM', 'LEMBRETE', 'ALTERACAO')`,
    ),
  ],
);

// Copy gerada para uma pessoa escalada. dados_hash muda quando escala, voo ou quarto mudam:
// a mensagem vira DESATUALIZADA e aparece para reenviar.
export const mensagem = eventosSchema.table(
  "mensagem",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    convocacaoId: uuid("convocacao_id")
      .notNull()
      .references(() => convocacao.id, { onDelete: "cascade" }),
    modeloId: uuid("modelo_id")
      .notNull()
      .references(() => modeloCopy.id, { onDelete: "restrict" }),
    texto: text("texto").notNull(),
    dadosHash: text("dados_hash").notNull(),
    canal: text("canal"),
    status: text("status").notNull().default("GERADA"),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    enviadaPor: uuid("enviada_por").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mensagem_convocacao_idx").on(table.convocacaoId),
    index("mensagem_modelo_idx").on(table.modeloId),
    index("mensagem_enviada_por_idx").on(table.enviadaPor),
    index("mensagem_status_idx").on(table.status),
    check("mensagem_canal_check", sql`${table.canal} IS NULL OR ${table.canal} IN ('WHATSAPP', 'COPIADO')`),
    check(
      "mensagem_status_check",
      sql`${table.status} IN ('GERADA', 'ENVIADA', 'FALHOU', 'DESATUALIZADA')`,
    ),
    check(
      "mensagem_enviada_check",
      sql`${table.status} <> 'ENVIADA' OR (${table.enviadaEm} IS NOT NULL AND ${table.canal} IS NOT NULL)`,
    ),
  ],
);
