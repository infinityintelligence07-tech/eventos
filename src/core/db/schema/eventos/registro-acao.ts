import { sql } from "drizzle-orm";
import { check, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { pessoa, usuario } from "../core";
import { evento } from "./evento";
import { eventosSchema } from "./schemas";

// Histórico das ações do time (aprovar, devolver, registrar resposta em nome da pessoa...).
// Só inclusão: um trigger da migration 0004 recusa UPDATE, DELETE e TRUNCATE.
export const registroAcao = eventosSchema.table(
  "registro_acao",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    entidade: text("entidade").notNull(),
    // Polimórfica (sem FK): o id da linha em `entidade`.
    entidadeId: uuid("entidade_id").notNull(),
    eventoId: uuid("evento_id").references(() => evento.id, { onDelete: "set null" }),
    acao: text("acao").notNull(),
    statusDe: text("status_de"),
    statusPara: text("status_para"),
    comentario: text("comentario"),
    // Preenchido = registrado pelo time em nome desta pessoa.
    emNomeDePessoaId: uuid("em_nome_de_pessoa_id").references(() => pessoa.id, { onDelete: "set null" }),
    usuarioId: uuid("usuario_id").references(() => usuario.id, { onDelete: "set null" }),
    dados: jsonb("dados").notNull().default(sql`'{}'::jsonb`),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("registro_acao_entidade_idx").on(table.entidade, table.entidadeId, table.criadoEm),
    index("registro_acao_evento_idx").on(table.eventoId),
    index("registro_acao_em_nome_de_idx").on(table.emNomeDePessoaId),
    index("registro_acao_usuario_idx").on(table.usuarioId),
    check(
      "registro_acao_entidade_check",
      sql`${table.entidade} IN ('ESCALA_DO_EVENTO', 'CONVOCACAO', 'MENSAGEM', 'DISPONIBILIDADE', 'SOLICITACAO_CUSTO', 'PEDIDO_SDC', 'HOSPEDAGEM', 'CARONA', 'REGRA_CUSTO', 'MODELO_COPY', 'TIPO_EVENTO', 'CONFIGURACAO')`,
    ),
    check("registro_acao_acao_check", sql`${table.acao} ~ '^[A-Z_]{3,40}$'`),
    check("registro_acao_comentario_check", sql`${table.comentario} IS NULL OR length(${table.comentario}) <= 2000`),
  ],
);
