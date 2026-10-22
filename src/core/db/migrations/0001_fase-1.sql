CREATE TABLE "eventos"."funcao" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcao_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "funcao_codigo_check" CHECK ("eventos"."funcao"."codigo" ~ '^[A-Z0-9_]{2,30}$')
);
--> statement-breakpoint
CREATE TABLE "eventos"."local" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'EVENTO' NOT NULL,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"cep" text,
	"lat" double precision,
	"lng" double precision,
	"capacidade" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "local_tipo_check" CHECK ("eventos"."local"."tipo" IN ('EVENTO', 'HOTEL', 'APARTAMENTO')),
	CONSTRAINT "local_uf_check" CHECK ("eventos"."local"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "local_capacidade_check" CHECK ("eventos"."local"."capacidade" IS NULL OR "eventos"."local"."capacidade" > 0)
);
--> statement-breakpoint
CREATE TABLE "eventos"."tipo_evento" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"sigla" text NOT NULL,
	"nome" text NOT NULL,
	"dias" integer,
	"regra_vagas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipo_evento_sigla_unique" UNIQUE("sigla"),
	CONSTRAINT "tipo_evento_sigla_check" CHECK ("eventos"."tipo_evento"."sigla" ~ '^[A-Z0-9_]{2,20}$'),
	CONSTRAINT "tipo_evento_dias_check" CHECK ("eventos"."tipo_evento"."dias" IS NULL OR "eventos"."tipo_evento"."dias" > 0)
);
--> statement-breakpoint
CREATE TABLE "eventos"."mensagem" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"convocacao_id" uuid NOT NULL,
	"modelo_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"dados_hash" text NOT NULL,
	"canal" text,
	"status" text DEFAULT 'GERADA' NOT NULL,
	"enviada_em" timestamp with time zone,
	"enviada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagem_canal_check" CHECK ("eventos"."mensagem"."canal" IS NULL OR "eventos"."mensagem"."canal" IN ('WHATSAPP', 'COPIADO')),
	CONSTRAINT "mensagem_status_check" CHECK ("eventos"."mensagem"."status" IN ('GERADA', 'ENVIADA', 'FALHOU', 'DESATUALIZADA'))
);
--> statement-breakpoint
CREATE TABLE "eventos"."modelo_copy" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"corpo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modelo_copy_tipo_check" CHECK ("eventos"."modelo_copy"."tipo" IN ('ESCALACAO', 'HOSPEDAGEM', 'LEMBRETE', 'ALTERACAO'))
);
--> statement-breakpoint
CREATE TABLE "eventos"."custo_item" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"categoria" text NOT NULL,
	"regra_custo_id" uuid,
	"descricao" text NOT NULL,
	"quantidade" numeric(8, 2) DEFAULT '1' NOT NULL,
	"valor_centavos" integer NOT NULL,
	"comprovante_url" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custo_item_categoria_check" CHECK ("eventos"."custo_item"."categoria" IN ('REMUNERACAO', 'ALIMENTACAO', 'ADICIONAL', 'MONTAGEM', 'OUTRO')),
	CONSTRAINT "custo_item_valor_check" CHECK ("eventos"."custo_item"."valor_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "eventos"."deslocamento" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"origem" text NOT NULL,
	"destino" text NOT NULL,
	"ida_volta" boolean DEFAULT true NOT NULL,
	"km" numeric(8, 1) NOT NULL,
	"consumo_km_l" numeric(4, 1) NOT NULL,
	"preco_litro_centavos" integer NOT NULL,
	"combustivel_centavos" integer NOT NULL,
	"pedagio_centavos" integer DEFAULT 0 NOT NULL,
	"depreciacao_centavos" integer DEFAULT 0 NOT NULL,
	"total_centavos" integer NOT NULL,
	"nivel_excecao" text DEFAULT 'NENHUM' NOT NULL,
	"rota_cache_id" uuid,
	"comprovante_url" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deslocamento_ordem_unique" UNIQUE("solicitacao_id","ordem"),
	CONSTRAINT "deslocamento_km_check" CHECK ("eventos"."deslocamento"."km" >= 0),
	CONSTRAINT "deslocamento_consumo_check" CHECK ("eventos"."deslocamento"."consumo_km_l" > 0),
	CONSTRAINT "deslocamento_valores_check" CHECK ("eventos"."deslocamento"."preco_litro_centavos" >= 0 AND "eventos"."deslocamento"."combustivel_centavos" >= 0 AND "eventos"."deslocamento"."pedagio_centavos" >= 0 AND "eventos"."deslocamento"."depreciacao_centavos" >= 0 AND "eventos"."deslocamento"."total_centavos" >= 0),
	CONSTRAINT "deslocamento_excecao_check" CHECK ("eventos"."deslocamento"."nivel_excecao" IN ('NENHUM', 'ALERTA', 'CRITICO'))
);
--> statement-breakpoint
CREATE TABLE "eventos"."protocolo_sequencia" (
	"ano_mes" text PRIMARY KEY NOT NULL,
	"ultimo" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos"."regra_custo" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"categoria" text NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo_evento_id" uuid,
	"uf" text,
	"unidade" text NOT NULL,
	"valor_centavos" integer,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vigente_desde" date DEFAULT CURRENT_DATE NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regra_custo_vigencia_unique" UNIQUE NULLS NOT DISTINCT("categoria","codigo","tipo_evento_id","uf","vigente_desde"),
	CONSTRAINT "regra_custo_categoria_check" CHECK ("eventos"."regra_custo"."categoria" IN ('REMUNERACAO', 'ALIMENTACAO', 'DEPRECIACAO', 'ADICIONAL', 'MONTAGEM', 'COMBUSTIVEL', 'LIMITE')),
	CONSTRAINT "regra_custo_unidade_check" CHECK ("eventos"."regra_custo"."unidade" IN ('EVENTO', 'DIA', 'HORA', 'DESLOCAMENTO', 'LITRO', 'FIXO', 'NENHUMA')),
	CONSTRAINT "regra_custo_valor_check" CHECK ("eventos"."regra_custo"."valor_centavos" IS NULL OR "eventos"."regra_custo"."valor_centavos" >= 0),
	CONSTRAINT "regra_custo_uf_check" CHECK ("eventos"."regra_custo"."uf" IS NULL OR "eventos"."regra_custo"."uf" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "eventos"."rota_cache" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"provedor" text NOT NULL,
	"origem_hash" text NOT NULL,
	"destino_hash" text NOT NULL,
	"origem" text NOT NULL,
	"destino" text NOT NULL,
	"km" numeric(8, 1) NOT NULL,
	"tempo_min" integer NOT NULL,
	"pedagio_centavos" integer,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rota_cache_par_unique" UNIQUE("provedor","origem_hash","destino_hash")
);
--> statement-breakpoint
CREATE TABLE "eventos"."solicitacao_custo" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"protocolo" text NOT NULL,
	"evento_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"convocacao_id" uuid,
	"status_auditoria" text DEFAULT 'PENDENTE' NOT NULL,
	"status_financeiro" text DEFAULT 'AGUARDANDO_AUDITORIA' NOT NULL,
	"total_centavos" integer DEFAULT 0 NOT NULL,
	"nivel_excecao" text DEFAULT 'NENHUM' NOT NULL,
	"parecer" text,
	"auditado_por" uuid,
	"auditado_em" timestamp with time zone,
	"pago_em" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitacao_custo_protocolo_unique" UNIQUE("protocolo"),
	CONSTRAINT "solicitacao_custo_evento_pessoa_unique" UNIQUE("evento_id","pessoa_id"),
	CONSTRAINT "solicitacao_custo_protocolo_check" CHECK ("eventos"."solicitacao_custo"."protocolo" ~ '^STF-[0-9]{6}-[0-9]{4,}$'),
	CONSTRAINT "solicitacao_custo_auditoria_check" CHECK ("eventos"."solicitacao_custo"."status_auditoria" IN ('PENDENTE', 'APROVADO', 'REPROVADO')),
	CONSTRAINT "solicitacao_custo_financeiro_check" CHECK ("eventos"."solicitacao_custo"."status_financeiro" IN ('AGUARDANDO_AUDITORIA', 'AGUARDANDO_PAGAMENTO', 'PENDENTE_CADASTRO', 'PAGO', 'REJEITADO')),
	CONSTRAINT "solicitacao_custo_excecao_check" CHECK ("eventos"."solicitacao_custo"."nivel_excecao" IN ('NENHUM', 'ALERTA', 'CRITICO')),
	CONSTRAINT "solicitacao_custo_total_check" CHECK ("eventos"."solicitacao_custo"."total_centavos" >= 0),
	CONSTRAINT "solicitacao_custo_pago_check" CHECK (("eventos"."solicitacao_custo"."status_financeiro" = 'PAGO') = ("eventos"."solicitacao_custo"."pago_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "eventos"."disponibilidade" (
	"enquete_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"disponivel" boolean NOT NULL,
	"respondido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disponibilidade_evento_id_pessoa_id_pk" PRIMARY KEY("evento_id","pessoa_id")
);
--> statement-breakpoint
CREATE TABLE "eventos"."enquete" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"titulo" text NOT NULL,
	"fecha_em" timestamp with time zone NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos"."enquete_evento" (
	"enquete_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	CONSTRAINT "enquete_evento_enquete_id_evento_id_pk" PRIMARY KEY("enquete_id","evento_id")
);
--> statement-breakpoint
CREATE TABLE "eventos"."carona" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"evento_id" uuid NOT NULL,
	"motorista_pessoa_id" uuid NOT NULL,
	"distancia_km" numeric(7, 1),
	"tempo_trajeto_min" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carona_evento_motorista_unique" UNIQUE("evento_id","motorista_pessoa_id")
);
--> statement-breakpoint
CREATE TABLE "eventos"."pessoa_evento" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"iam_control_user_id" bigint,
	"iam_control_aluno_id" bigint,
	"sexo" text,
	"camiseta_modelo" text,
	"camiseta_tamanho" text,
	"possui_camiseta" boolean,
	"fez_confronto" boolean,
	"tem_cnpj" boolean,
	"lat" double precision,
	"lng" double precision,
	"geocodificado_em" timestamp with time zone,
	"cadastro_revisado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoa_evento_iam_control_user_id_unique" UNIQUE("iam_control_user_id"),
	CONSTRAINT "pessoa_evento_sexo_check" CHECK ("eventos"."pessoa_evento"."sexo" IS NULL OR "eventos"."pessoa_evento"."sexo" IN ('F', 'M')),
	CONSTRAINT "pessoa_evento_camiseta_modelo_check" CHECK ("eventos"."pessoa_evento"."camiseta_modelo" IS NULL OR "eventos"."pessoa_evento"."camiseta_modelo" IN ('CAMISETA', 'BABY_LOOK')),
	CONSTRAINT "pessoa_evento_camiseta_tamanho_check" CHECK ("eventos"."pessoa_evento"."camiseta_tamanho" IS NULL OR "eventos"."pessoa_evento"."camiseta_tamanho" IN ('PP', 'P', 'M', 'G', 'GG', 'XG'))
);
--> statement-breakpoint
CREATE TABLE "eventos"."pessoa_funcao" (
	"pessoa_id" uuid NOT NULL,
	"funcao_id" uuid NOT NULL,
	"nivel" text DEFAULT 'HABILITADO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoa_funcao_pessoa_id_funcao_id_pk" PRIMARY KEY("pessoa_id","funcao_id"),
	CONSTRAINT "pessoa_funcao_nivel_check" CHECK ("eventos"."pessoa_funcao"."nivel" IN ('TRAINEE', 'HABILITADO'))
);
--> statement-breakpoint
CREATE TABLE "eventos"."pessoa_veiculo" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"lugares" smallint NOT NULL,
	"consumo_km_l" numeric(4, 1),
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoa_veiculo_lugares_check" CHECK ("eventos"."pessoa_veiculo"."lugares" BETWEEN 1 AND 8),
	CONSTRAINT "pessoa_veiculo_consumo_check" CHECK ("eventos"."pessoa_veiculo"."consumo_km_l" IS NULL OR "eventos"."pessoa_veiculo"."consumo_km_l" > 0)
);
--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "convidada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "motivo_recusa" text;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "deslocamento" text;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "carona_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "distancia_km" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "tempo_trajeto_min" integer;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "montagem" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "sugestao_score" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD COLUMN "funcao_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD COLUMN "origem" text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "tipo_evento_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "codigo" text;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "edicao" text;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "iam_control_turma_id" bigint;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "local_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "expectativa_publico" integer;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "pessoas_na_fila" integer;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "status_escala" text DEFAULT 'SEM_ESCALA' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "aprovado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "aprovado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "sincronizado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos"."mensagem" ADD CONSTRAINT "mensagem_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "eventos"."convocacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."mensagem" ADD CONSTRAINT "mensagem_modelo_id_modelo_copy_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "eventos"."modelo_copy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."mensagem" ADD CONSTRAINT "mensagem_enviada_por_usuario_id_fk" FOREIGN KEY ("enviada_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."custo_item" ADD CONSTRAINT "custo_item_solicitacao_id_solicitacao_custo_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "eventos"."solicitacao_custo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."custo_item" ADD CONSTRAINT "custo_item_regra_custo_id_regra_custo_id_fk" FOREIGN KEY ("regra_custo_id") REFERENCES "eventos"."regra_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."deslocamento" ADD CONSTRAINT "deslocamento_solicitacao_id_solicitacao_custo_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "eventos"."solicitacao_custo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."deslocamento" ADD CONSTRAINT "deslocamento_rota_cache_id_rota_cache_id_fk" FOREIGN KEY ("rota_cache_id") REFERENCES "eventos"."rota_cache"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."regra_custo" ADD CONSTRAINT "regra_custo_tipo_evento_id_tipo_evento_id_fk" FOREIGN KEY ("tipo_evento_id") REFERENCES "eventos"."tipo_evento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."solicitacao_custo" ADD CONSTRAINT "solicitacao_custo_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."solicitacao_custo" ADD CONSTRAINT "solicitacao_custo_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."solicitacao_custo" ADD CONSTRAINT "solicitacao_custo_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "eventos"."convocacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."solicitacao_custo" ADD CONSTRAINT "solicitacao_custo_auditado_por_usuario_id_fk" FOREIGN KEY ("auditado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."disponibilidade" ADD CONSTRAINT "disponibilidade_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."disponibilidade" ADD CONSTRAINT "disponibilidade_enquete_evento_fk" FOREIGN KEY ("enquete_id","evento_id") REFERENCES "eventos"."enquete_evento"("enquete_id","evento_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."enquete" ADD CONSTRAINT "enquete_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."enquete_evento" ADD CONSTRAINT "enquete_evento_enquete_id_enquete_id_fk" FOREIGN KEY ("enquete_id") REFERENCES "eventos"."enquete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."enquete_evento" ADD CONSTRAINT "enquete_evento_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."carona" ADD CONSTRAINT "carona_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."carona" ADD CONSTRAINT "carona_motorista_pessoa_id_pessoa_id_fk" FOREIGN KEY ("motorista_pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD CONSTRAINT "pessoa_evento_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_funcao" ADD CONSTRAINT "pessoa_funcao_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_funcao" ADD CONSTRAINT "pessoa_funcao_funcao_id_funcao_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "eventos"."funcao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_veiculo" ADD CONSTRAINT "pessoa_veiculo_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_cidade_idx" ON "eventos"."local" USING btree ("uf","cidade");--> statement-breakpoint
CREATE INDEX "mensagem_convocacao_idx" ON "eventos"."mensagem" USING btree ("convocacao_id");--> statement-breakpoint
CREATE INDEX "mensagem_modelo_idx" ON "eventos"."mensagem" USING btree ("modelo_id");--> statement-breakpoint
CREATE INDEX "mensagem_enviada_por_idx" ON "eventos"."mensagem" USING btree ("enviada_por");--> statement-breakpoint
CREATE INDEX "mensagem_status_idx" ON "eventos"."mensagem" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custo_item_solicitacao_idx" ON "eventos"."custo_item" USING btree ("solicitacao_id");--> statement-breakpoint
CREATE INDEX "custo_item_regra_idx" ON "eventos"."custo_item" USING btree ("regra_custo_id");--> statement-breakpoint
CREATE INDEX "deslocamento_rota_cache_idx" ON "eventos"."deslocamento" USING btree ("rota_cache_id");--> statement-breakpoint
CREATE INDEX "regra_custo_tipo_evento_idx" ON "eventos"."regra_custo" USING btree ("tipo_evento_id");--> statement-breakpoint
CREATE INDEX "solicitacao_custo_pessoa_idx" ON "eventos"."solicitacao_custo" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "solicitacao_custo_convocacao_idx" ON "eventos"."solicitacao_custo" USING btree ("convocacao_id");--> statement-breakpoint
CREATE INDEX "solicitacao_custo_auditado_por_idx" ON "eventos"."solicitacao_custo" USING btree ("auditado_por");--> statement-breakpoint
CREATE INDEX "solicitacao_custo_status_idx" ON "eventos"."solicitacao_custo" USING btree ("status_auditoria","status_financeiro");--> statement-breakpoint
CREATE INDEX "disponibilidade_pessoa_idx" ON "eventos"."disponibilidade" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "disponibilidade_enquete_evento_idx" ON "eventos"."disponibilidade" USING btree ("enquete_id","evento_id");--> statement-breakpoint
CREATE INDEX "enquete_criado_por_idx" ON "eventos"."enquete" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "enquete_evento_evento_idx" ON "eventos"."enquete_evento" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "carona_motorista_idx" ON "eventos"."carona" USING btree ("motorista_pessoa_id");--> statement-breakpoint
CREATE INDEX "pessoa_evento_aluno_idx" ON "eventos"."pessoa_evento" USING btree ("iam_control_aluno_id");--> statement-breakpoint
CREATE INDEX "pessoa_funcao_funcao_idx" ON "eventos"."pessoa_funcao" USING btree ("funcao_id");--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_carona_id_carona_id_fk" FOREIGN KEY ("carona_id") REFERENCES "eventos"."carona"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD CONSTRAINT "escala_funcao_id_funcao_id_fk" FOREIGN KEY ("funcao_id") REFERENCES "eventos"."funcao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_tipo_evento_id_tipo_evento_id_fk" FOREIGN KEY ("tipo_evento_id") REFERENCES "eventos"."tipo_evento"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_local_id_local_id_fk" FOREIGN KEY ("local_id") REFERENCES "eventos"."local"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_aprovado_por_usuario_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convocacao_carona_idx" ON "eventos"."convocacao" USING btree ("carona_id");--> statement-breakpoint
CREATE INDEX "convocacao_criado_por_idx" ON "eventos"."convocacao" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "escala_funcao_idx" ON "eventos"."escala" USING btree ("funcao_id");--> statement-breakpoint
CREATE INDEX "evento_tipo_idx" ON "eventos"."evento" USING btree ("tipo_evento_id");--> statement-breakpoint
CREATE INDEX "evento_local_idx" ON "eventos"."evento" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "evento_aprovado_por_idx" ON "eventos"."evento" USING btree ("aprovado_por");--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_codigo_unique" UNIQUE("codigo");--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_iam_control_turma_id_unique" UNIQUE("iam_control_turma_id");--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_deslocamento_check" CHECK ("eventos"."convocacao"."deslocamento" IS NULL OR "eventos"."convocacao"."deslocamento" IN ('CARRO_PROPRIO', 'CARONA', 'CARRO_IAM', 'UBER', 'ONIBUS', 'VOO', 'NAO_SE_APLICA'));--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD CONSTRAINT "escala_origem_check" CHECK ("eventos"."escala"."origem" IN ('REGRA', 'MANUAL'));--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_status_escala_check" CHECK ("eventos"."evento"."status_escala" IN ('SEM_ESCALA', 'RASCUNHO', 'APROVADA', 'COMUNICADA'));--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_aprovacao_check" CHECK (("eventos"."evento"."status_escala" IN ('APROVADA', 'COMUNICADA')) = ("eventos"."evento"."aprovado_em" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_publico_check" CHECK (("eventos"."evento"."expectativa_publico" IS NULL OR "eventos"."evento"."expectativa_publico" >= 0) AND ("eventos"."evento"."pessoas_na_fila" IS NULL OR "eventos"."evento"."pessoas_na_fila" >= 0));