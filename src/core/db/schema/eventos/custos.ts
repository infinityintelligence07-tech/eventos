import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { pessoa, usuario } from "../core";
import { tipoEvento } from "./cadastros";
import { convocacao, evento } from "./evento";
import { eventosSchema } from "./schemas";

// Valores configuráveis pela aba Configurações › Regras de custo (docs/03-regras-de-custo.md).
// Dinheiro sempre em centavos. parametros guarda faixas e limites, ex.: { "km_min": 100, "km_max": 249 }.
export const regraCusto = eventosSchema.table(
  "regra_custo",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    categoria: text("categoria").notNull(),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    tipoEventoId: uuid("tipo_evento_id").references(() => tipoEvento.id, { onDelete: "cascade" }),
    uf: text("uf"),
    unidade: text("unidade").notNull(),
    valorCentavos: integer("valor_centavos"),
    parametros: jsonb("parametros").notNull().default(sql`'{}'::jsonb`),
    vigenteDesde: date("vigente_desde").notNull().default(sql`CURRENT_DATE`),
    ativo: boolean("ativo").notNull().default(true),
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("regra_custo_vigencia_unique")
      .on(table.categoria, table.codigo, table.tipoEventoId, table.uf, table.vigenteDesde)
      .nullsNotDistinct(),
    index("regra_custo_tipo_evento_idx").on(table.tipoEventoId),
    check(
      "regra_custo_categoria_check",
      sql`${table.categoria} IN ('REMUNERACAO', 'ALIMENTACAO', 'DEPRECIACAO', 'ADICIONAL', 'MONTAGEM', 'COMBUSTIVEL', 'LIMITE')`,
    ),
    check(
      "regra_custo_unidade_check",
      sql`${table.unidade} IN ('EVENTO', 'DIA', 'HORA', 'DESLOCAMENTO', 'LITRO', 'FIXO', 'NENHUMA')`,
    ),
    check("regra_custo_valor_check", sql`${table.valorCentavos} IS NULL OR ${table.valorCentavos} >= 0`),
    check("regra_custo_uf_check", sql`${table.uf} IS NULL OR ${table.uf} ~ '^[A-Z]{2}$'`),
  ],
);

// Numeração do protocolo STF-AAAAMM-NNNN, sem repetição (função eventos.proximo_protocolo()).
export const protocoloSequencia = eventosSchema.table("protocolo_sequencia", {
  anoMes: text("ano_mes").primaryKey(),
  ultimo: integer("ultimo").notNull(),
});

// Solicitação de custo de uma pessoa num evento, pré-calculada pela regra.
// Dois eixos de status: auditoria (time de eventos) e financeiro.
export const solicitacaoCusto = eventosSchema.table(
  "solicitacao_custo",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    protocolo: text("protocolo").notNull().unique(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "restrict" }),
    convocacaoId: uuid("convocacao_id").references(() => convocacao.id, { onDelete: "set null" }),
    statusAuditoria: text("status_auditoria").notNull().default("PENDENTE"),
    statusFinanceiro: text("status_financeiro").notNull().default("AGUARDANDO_AUDITORIA"),
    // Soma de deslocamentos e itens; recalculada pelo sistema a cada alteração.
    totalCentavos: integer("total_centavos").notNull().default(0),
    nivelExcecao: text("nivel_excecao").notNull().default("NENHUM"),
    parecer: text("parecer"),
    auditadoPor: uuid("auditado_por").references(() => usuario.id, { onDelete: "set null" }),
    auditadoEm: timestamp("auditado_em", { withTimezone: true }),
    pagoEm: date("pago_em"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("solicitacao_custo_evento_pessoa_unique").on(table.eventoId, table.pessoaId),
    index("solicitacao_custo_pessoa_idx").on(table.pessoaId),
    index("solicitacao_custo_convocacao_idx").on(table.convocacaoId),
    index("solicitacao_custo_auditado_por_idx").on(table.auditadoPor),
    index("solicitacao_custo_status_idx").on(table.statusAuditoria, table.statusFinanceiro),
    check(
      "solicitacao_custo_protocolo_check",
      sql`${table.protocolo} ~ '^STF-[0-9]{6}-[0-9]{4,}$'`,
    ),
    check(
      "solicitacao_custo_auditoria_check",
      sql`${table.statusAuditoria} IN ('PENDENTE', 'APROVADO', 'REPROVADO')`,
    ),
    check(
      "solicitacao_custo_financeiro_check",
      sql`${table.statusFinanceiro} IN ('AGUARDANDO_AUDITORIA', 'AGUARDANDO_PAGAMENTO', 'PENDENTE_CADASTRO', 'PAGO', 'REJEITADO')`,
    ),
    check(
      "solicitacao_custo_excecao_check",
      sql`${table.nivelExcecao} IN ('NENHUM', 'ALERTA', 'CRITICO')`,
    ),
    check("solicitacao_custo_total_check", sql`${table.totalCentavos} >= 0`),
    check(
      "solicitacao_custo_pago_check",
      sql`(${table.statusFinanceiro} = 'PAGO') = (${table.pagoEm} IS NOT NULL)`,
    ),
  ],
);

// Cache de rota (Google Routes API) por par de endereços normalizados.
export const rotaCache = eventosSchema.table(
  "rota_cache",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    provedor: text("provedor").notNull(),
    origemHash: text("origem_hash").notNull(),
    destinoHash: text("destino_hash").notNull(),
    origem: text("origem").notNull(),
    destino: text("destino").notNull(),
    km: numeric("km", { precision: 8, scale: 1 }).notNull(),
    tempoMin: integer("tempo_min").notNull(),
    pedagioCentavos: integer("pedagio_centavos"),
    consultadoEm: timestamp("consultado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rota_cache_par_unique").on(table.provedor, table.origemHash, table.destinoHash),
  ],
);

// Cada deslocamento conta separado na faixa de depreciação (docs/03-regras-de-custo.md).
export const deslocamento = eventosSchema.table(
  "deslocamento",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    solicitacaoId: uuid("solicitacao_id")
      .notNull()
      .references(() => solicitacaoCusto.id, { onDelete: "cascade" }),
    ordem: smallint("ordem").notNull(),
    origem: text("origem").notNull(),
    destino: text("destino").notNull(),
    idaVolta: boolean("ida_volta").notNull().default(true),
    km: numeric("km", { precision: 8, scale: 1 }).notNull(),
    consumoKmL: numeric("consumo_km_l", { precision: 4, scale: 1 }).notNull(),
    precoLitroCentavos: integer("preco_litro_centavos").notNull(),
    combustivelCentavos: integer("combustivel_centavos").notNull(),
    pedagioCentavos: integer("pedagio_centavos").notNull().default(0),
    depreciacaoCentavos: integer("depreciacao_centavos").notNull().default(0),
    totalCentavos: integer("total_centavos").notNull(),
    nivelExcecao: text("nivel_excecao").notNull().default("NENHUM"),
    rotaCacheId: uuid("rota_cache_id").references(() => rotaCache.id, { onDelete: "set null" }),
    comprovanteUrl: text("comprovante_url"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("deslocamento_ordem_unique").on(table.solicitacaoId, table.ordem),
    index("deslocamento_rota_cache_idx").on(table.rotaCacheId),
    check("deslocamento_km_check", sql`${table.km} >= 0`),
    check("deslocamento_consumo_check", sql`${table.consumoKmL} > 0`),
    check(
      "deslocamento_valores_check",
      sql`${table.precoLitroCentavos} >= 0 AND ${table.combustivelCentavos} >= 0 AND ${table.pedagioCentavos} >= 0 AND ${table.depreciacaoCentavos} >= 0 AND ${table.totalCentavos} >= 0`,
    ),
    check(
      "deslocamento_excecao_check",
      sql`${table.nivelExcecao} IN ('NENHUM', 'ALERTA', 'CRITICO')`,
    ),
  ],
);

// Itens que não são deslocamento: alimentação, remuneração, adicionais (AP IAM, estacionamento...).
export const custoItem = eventosSchema.table(
  "custo_item",
  {
    id: uuid("id").default(sql`public.uuid_v7()`).primaryKey(),
    solicitacaoId: uuid("solicitacao_id")
      .notNull()
      .references(() => solicitacaoCusto.id, { onDelete: "cascade" }),
    categoria: text("categoria").notNull(),
    regraCustoId: uuid("regra_custo_id").references(() => regraCusto.id, { onDelete: "set null" }),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 8, scale: 2 }).notNull().default("1"),
    valorCentavos: integer("valor_centavos").notNull(),
    comprovanteUrl: text("comprovante_url"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("custo_item_solicitacao_idx").on(table.solicitacaoId),
    index("custo_item_regra_idx").on(table.regraCustoId),
    check(
      "custo_item_categoria_check",
      sql`${table.categoria} IN ('REMUNERACAO', 'ALIMENTACAO', 'ADICIONAL', 'MONTAGEM', 'OUTRO')`,
    ),
    check("custo_item_valor_check", sql`${table.valorCentavos} >= 0`),
  ],
);
