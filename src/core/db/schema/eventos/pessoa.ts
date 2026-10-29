import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { pessoa } from "../core";
import { funcao } from "./cadastros";
import { eventosSchema } from "./schemas";

// O que só o Eventos precisa saber da pessoa (ADR 0001, regra 4). Endereço e CPF ficam em sensivel (GH).
export const pessoaEvento = eventosSchema.table(
  "pessoa_evento",
  {
    pessoaId: uuid("pessoa_id")
      .primaryKey()
      .references(() => pessoa.id, { onDelete: "cascade" }),
    iamControlUserId: bigint("iam_control_user_id", { mode: "number" }).unique(),
    iamControlAlunoId: bigint("iam_control_aluno_id", { mode: "number" }),
    sexo: text("sexo"),
    camisetaModelo: text("camiseta_modelo"),
    camisetaTamanho: text("camiseta_tamanho"),
    possuiCamiseta: boolean("possui_camiseta"),
    fezConfronto: boolean("fez_confronto"),
    temCnpj: boolean("tem_cnpj"),
    // Geocodificação do endereço de sensivel.pessoa_dado_sensivel (distância e caronas).
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geocodificadoEm: timestamp("geocodificado_em", { withTimezone: true }),
    cadastroRevisadoEm: timestamp("cadastro_revisado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("pessoa_evento_sexo_check", sql`${table.sexo} IS NULL OR ${table.sexo} IN ('F', 'M')`),
    check(
      "pessoa_evento_camiseta_modelo_check",
      sql`${table.camisetaModelo} IS NULL OR ${table.camisetaModelo} IN ('CAMISETA', 'BABY_LOOK')`,
    ),
    check(
      "pessoa_evento_camiseta_tamanho_check",
      sql`${table.camisetaTamanho} IS NULL OR ${table.camisetaTamanho} IN ('PP', 'P', 'M', 'G', 'GG', 'XG')`,
    ),
    index("pessoa_evento_aluno_idx").on(table.iamControlAlunoId),
  ],
);

export const pessoaFuncao = eventosSchema.table(
  "pessoa_funcao",
  {
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoa.id, { onDelete: "cascade" }),
    funcaoId: uuid("funcao_id")
      .notNull()
      .references(() => funcao.id, { onDelete: "cascade" }),
    nivel: text("nivel").notNull().default("HABILITADO"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.pessoaId, table.funcaoId] }),
    check("pessoa_funcao_nivel_check", sql`${table.nivel} IN ('TRAINEE', 'HABILITADO')`),
    index("pessoa_funcao_funcao_idx").on(table.funcaoId),
  ],
);

export const pessoaVeiculo = eventosSchema.table(
  "pessoa_veiculo",
  {
    pessoaId: uuid("pessoa_id")
      .primaryKey()
      .references(() => pessoa.id, { onDelete: "cascade" }),
    lugares: smallint("lugares").notNull(),
    consumoKmL: numeric("consumo_km_l", { precision: 4, scale: 1 }),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("pessoa_veiculo_lugares_check", sql`${table.lugares} BETWEEN 1 AND 8`),
    check(
      "pessoa_veiculo_consumo_check",
      sql`${table.consumoKmL} IS NULL OR ${table.consumoKmL} > 0`,
    ),
  ],
);
