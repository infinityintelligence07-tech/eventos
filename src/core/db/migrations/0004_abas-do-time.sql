CREATE SEQUENCE "eventos"."pedido_sdc_referencia_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "eventos"."configuracao" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" text,
	"atualizado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracao_chave_check" CHECK ("eventos"."configuracao"."chave" ~ '^[a-z][a-z0-9_]{1,59}$')
);
--> statement-breakpoint
CREATE TABLE "eventos"."hospedagem" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"evento_id" uuid NOT NULL,
	"local_id" uuid NOT NULL,
	"pedido_id" uuid,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"numero_reserva" text,
	"observacao" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospedagem_pedido_id_unique" UNIQUE("pedido_id"),
	CONSTRAINT "hospedagem_periodo_check" CHECK ("eventos"."hospedagem"."check_out" > "eventos"."hospedagem"."check_in")
);
--> statement-breakpoint
CREATE TABLE "eventos"."pedido_sdc" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"referencia" text DEFAULT 'SDC-' || lpad(nextval('eventos.pedido_sdc_referencia_seq')::text, 6, '0') NOT NULL,
	"tipo" text NOT NULL,
	"evento_id" uuid NOT NULL,
	"pessoa_id" uuid,
	"convocacao_id" uuid,
	"situacao" text DEFAULT 'PEDIDO' NOT NULL,
	"valor_centavos" integer,
	"observacao_time" text,
	"observacao_sdc" text,
	"solicitado_por" uuid,
	"solicitado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"emitido_em" timestamp with time zone,
	"retorno_registrado_por" uuid,
	"cancelado_em" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelamento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedido_sdc_referencia_unique" UNIQUE("referencia"),
	CONSTRAINT "pedido_sdc_referencia_check" CHECK ("eventos"."pedido_sdc"."referencia" ~ '^SDC-[0-9]{6,}$'),
	CONSTRAINT "pedido_sdc_tipo_check" CHECK ("eventos"."pedido_sdc"."tipo" IN ('VOO', 'HOSPEDAGEM')),
	CONSTRAINT "pedido_sdc_passageiro_check" CHECK (("eventos"."pedido_sdc"."tipo" = 'VOO') = ("eventos"."pedido_sdc"."pessoa_id" IS NOT NULL)),
	CONSTRAINT "pedido_sdc_situacao_check" CHECK ("eventos"."pedido_sdc"."situacao" IN ('PEDIDO', 'EMITIDO', 'ALTERADO', 'CANCELADO')),
	CONSTRAINT "pedido_sdc_valor_check" CHECK ("eventos"."pedido_sdc"."valor_centavos" IS NULL OR "eventos"."pedido_sdc"."valor_centavos" >= 0),
	CONSTRAINT "pedido_sdc_emitido_check" CHECK ("eventos"."pedido_sdc"."situacao" <> 'EMITIDO' OR "eventos"."pedido_sdc"."emitido_em" IS NOT NULL),
	CONSTRAINT "pedido_sdc_cancelado_check" CHECK (("eventos"."pedido_sdc"."situacao" = 'CANCELADO') = ("eventos"."pedido_sdc"."cancelado_em" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "eventos"."quarto" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"hospedagem_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"capacidade" smallint NOT NULL,
	"sexo" text,
	"valor_diaria_centavos" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarto_hospedagem_nome_unique" UNIQUE("hospedagem_id","nome"),
	CONSTRAINT "quarto_capacidade_check" CHECK ("eventos"."quarto"."capacidade" BETWEEN 1 AND 4),
	CONSTRAINT "quarto_sexo_check" CHECK ("eventos"."quarto"."sexo" IS NULL OR "eventos"."quarto"."sexo" IN ('F', 'M')),
	CONSTRAINT "quarto_valor_check" CHECK ("eventos"."quarto"."valor_diaria_centavos" IS NULL OR "eventos"."quarto"."valor_diaria_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "eventos"."quarto_ocupante" (
	"quarto_id" uuid NOT NULL,
	"convocacao_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarto_ocupante_quarto_id_convocacao_id_pk" PRIMARY KEY("quarto_id","convocacao_id"),
	CONSTRAINT "quarto_ocupante_convocacao_id_unique" UNIQUE("convocacao_id")
);
--> statement-breakpoint
CREATE TABLE "eventos"."trecho_voo" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"sentido" text NOT NULL,
	"origem_iata" text NOT NULL,
	"destino_iata" text NOT NULL,
	"data_desejada" date NOT NULL,
	"preferencia_horario" text,
	"companhia" text,
	"numero_voo" text,
	"localizador" text,
	"partida_em" timestamp with time zone,
	"chegada_em" timestamp with time zone,
	"cartao_embarque_url" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trecho_voo_pedido_sentido_unique" UNIQUE("pedido_id","sentido"),
	CONSTRAINT "trecho_voo_sentido_check" CHECK ("eventos"."trecho_voo"."sentido" IN ('IDA', 'VOLTA')),
	CONSTRAINT "trecho_voo_iata_check" CHECK ("eventos"."trecho_voo"."origem_iata" ~ '^[A-Z]{3}$' AND "eventos"."trecho_voo"."destino_iata" ~ '^[A-Z]{3}$' AND "eventos"."trecho_voo"."origem_iata" <> "eventos"."trecho_voo"."destino_iata"),
	CONSTRAINT "trecho_voo_preferencia_check" CHECK ("eventos"."trecho_voo"."preferencia_horario" IS NULL OR "eventos"."trecho_voo"."preferencia_horario" IN ('MANHA', 'TARDE', 'NOITE', 'QUALQUER')),
	CONSTRAINT "trecho_voo_numero_check" CHECK ("eventos"."trecho_voo"."numero_voo" IS NULL OR "eventos"."trecho_voo"."numero_voo" ~ '^[A-Z0-9]{2}[0-9]{1,4}$'),
	CONSTRAINT "trecho_voo_localizador_check" CHECK ("eventos"."trecho_voo"."localizador" IS NULL OR "eventos"."trecho_voo"."localizador" ~ '^[A-Z0-9]{5,8}$'),
	CONSTRAINT "trecho_voo_horario_check" CHECK ("eventos"."trecho_voo"."partida_em" IS NULL OR "eventos"."trecho_voo"."chegada_em" IS NULL OR "eventos"."trecho_voo"."chegada_em" > "eventos"."trecho_voo"."partida_em"),
	CONSTRAINT "trecho_voo_cartao_check" CHECK ("eventos"."trecho_voo"."cartao_embarque_url" IS NULL OR "eventos"."trecho_voo"."cartao_embarque_url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "eventos"."registro_acao" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"evento_id" uuid,
	"acao" text NOT NULL,
	"status_de" text,
	"status_para" text,
	"comentario" text,
	"em_nome_de_pessoa_id" uuid,
	"usuario_id" uuid,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registro_acao_entidade_check" CHECK ("eventos"."registro_acao"."entidade" IN ('ESCALA_DO_EVENTO', 'CONVOCACAO', 'MENSAGEM', 'DISPONIBILIDADE', 'SOLICITACAO_CUSTO', 'PEDIDO_SDC', 'HOSPEDAGEM', 'CARONA', 'REGRA_CUSTO', 'MODELO_COPY', 'TIPO_EVENTO', 'CONFIGURACAO')),
	CONSTRAINT "registro_acao_acao_check" CHECK ("eventos"."registro_acao"."acao" ~ '^[A-Z_]{3,40}$'),
	CONSTRAINT "registro_acao_comentario_check" CHECK ("eventos"."registro_acao"."comentario" IS NULL OR length("eventos"."registro_acao"."comentario") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "eventos"."evento" DROP CONSTRAINT "evento_status_escala_check";--> statement-breakpoint
ALTER TABLE "eventos"."solicitacao_custo" ADD COLUMN "registrado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."disponibilidade" ADD COLUMN "registrado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "registrado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD COLUMN "confirmada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD COLUMN "confirmada_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."configuracao" ADD CONSTRAINT "configuracao_atualizado_por_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem" ADD CONSTRAINT "hospedagem_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem" ADD CONSTRAINT "hospedagem_local_id_local_id_fk" FOREIGN KEY ("local_id") REFERENCES "eventos"."local"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem" ADD CONSTRAINT "hospedagem_pedido_id_pedido_sdc_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "eventos"."pedido_sdc"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem" ADD CONSTRAINT "hospedagem_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "eventos"."convocacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_solicitado_por_usuario_id_fk" FOREIGN KEY ("solicitado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_retorno_registrado_por_usuario_id_fk" FOREIGN KEY ("retorno_registrado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_cancelado_por_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."quarto" ADD CONSTRAINT "quarto_hospedagem_id_hospedagem_id_fk" FOREIGN KEY ("hospedagem_id") REFERENCES "eventos"."hospedagem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_quarto_id_quarto_id_fk" FOREIGN KEY ("quarto_id") REFERENCES "eventos"."quarto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "eventos"."convocacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ADD CONSTRAINT "trecho_voo_pedido_id_pedido_sdc_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "eventos"."pedido_sdc"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_em_nome_de_pessoa_id_pessoa_id_fk" FOREIGN KEY ("em_nome_de_pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "configuracao_atualizado_por_idx" ON "eventos"."configuracao" USING btree ("atualizado_por");--> statement-breakpoint
CREATE INDEX "hospedagem_evento_idx" ON "eventos"."hospedagem" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "hospedagem_local_idx" ON "eventos"."hospedagem" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "hospedagem_criado_por_idx" ON "eventos"."hospedagem" USING btree ("criado_por");--> statement-breakpoint
CREATE INDEX "pedido_sdc_evento_idx" ON "eventos"."pedido_sdc" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "pedido_sdc_pessoa_idx" ON "eventos"."pedido_sdc" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "pedido_sdc_convocacao_idx" ON "eventos"."pedido_sdc" USING btree ("convocacao_id");--> statement-breakpoint
CREATE INDEX "pedido_sdc_solicitado_por_idx" ON "eventos"."pedido_sdc" USING btree ("solicitado_por");--> statement-breakpoint
CREATE INDEX "pedido_sdc_retorno_registrado_por_idx" ON "eventos"."pedido_sdc" USING btree ("retorno_registrado_por");--> statement-breakpoint
CREATE INDEX "pedido_sdc_cancelado_por_idx" ON "eventos"."pedido_sdc" USING btree ("cancelado_por");--> statement-breakpoint
CREATE INDEX "pedido_sdc_situacao_idx" ON "eventos"."pedido_sdc" USING btree ("situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_sdc_voo_ativo_unique" ON "eventos"."pedido_sdc" USING btree ("evento_id","pessoa_id") WHERE "eventos"."pedido_sdc"."tipo" = 'VOO' AND "eventos"."pedido_sdc"."situacao" <> 'CANCELADO';--> statement-breakpoint
CREATE INDEX "registro_acao_entidade_idx" ON "eventos"."registro_acao" USING btree ("entidade","entidade_id","criado_em");--> statement-breakpoint
CREATE INDEX "registro_acao_evento_idx" ON "eventos"."registro_acao" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "registro_acao_em_nome_de_idx" ON "eventos"."registro_acao" USING btree ("em_nome_de_pessoa_id");--> statement-breakpoint
CREATE INDEX "registro_acao_usuario_idx" ON "eventos"."registro_acao" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "eventos"."solicitacao_custo" ADD CONSTRAINT "solicitacao_custo_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."disponibilidade" ADD CONSTRAINT "disponibilidade_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD CONSTRAINT "escala_confirmada_por_usuario_id_fk" FOREIGN KEY ("confirmada_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solicitacao_custo_registrado_por_idx" ON "eventos"."solicitacao_custo" USING btree ("registrado_por");--> statement-breakpoint
CREATE INDEX "disponibilidade_registrado_por_idx" ON "eventos"."disponibilidade" USING btree ("registrado_por");--> statement-breakpoint
CREATE INDEX "convocacao_registrado_por_idx" ON "eventos"."convocacao" USING btree ("registrado_por");--> statement-breakpoint
CREATE INDEX "escala_confirmada_por_idx" ON "eventos"."escala" USING btree ("confirmada_por");--> statement-breakpoint
ALTER TABLE "eventos"."mensagem" ADD CONSTRAINT "mensagem_enviada_check" CHECK ("eventos"."mensagem"."status" <> 'ENVIADA' OR ("eventos"."mensagem"."enviada_em" IS NOT NULL AND "eventos"."mensagem"."canal" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_status_check" CHECK ("eventos"."convocacao"."status" IN ('SUGERIDA', 'CONVIDADA', 'ACEITA', 'RECUSADA', 'CANCELADA'));--> statement-breakpoint
ALTER TABLE "eventos"."escala" ADD CONSTRAINT "escala_confirmada_check" CHECK ("eventos"."escala"."confirmada_por" IS NULL OR "eventos"."escala"."confirmada_em" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD CONSTRAINT "evento_status_escala_check" CHECK ("eventos"."evento"."status_escala" IN ('SEM_ESCALA', 'RASCUNHO', 'AGUARDANDO_APROVACAO', 'DEVOLVIDA', 'APROVADA', 'COMUNICADA'));--> statement-breakpoint
-- A sequência some junto com a coluna que a usa.
ALTER SEQUENCE "eventos"."pedido_sdc_referencia_seq" OWNED BY "eventos"."pedido_sdc"."referencia";
--> statement-breakpoint
-- Segurança (mesma regra da 0002): RLS em todas as tabelas do schema eventos, sem políticas;
-- anon/authenticated (API do Supabase) sem acesso. Reaplicado para pegar as tabelas novas.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'eventos' LOOP
    EXECUTE format('ALTER TABLE eventos.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA eventos FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eventos FROM anon, authenticated;
  END IF;
END $$;
--> statement-breakpoint
-- registro_acao é só de inclusão: UPDATE, DELETE e TRUNCATE são recusados para qualquer papel.
CREATE OR REPLACE FUNCTION eventos.registro_acao_somente_inclusao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'eventos.registro_acao é só de inclusão (% recusado)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION eventos.registro_acao_somente_inclusao() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER registro_acao_somente_inclusao
  BEFORE UPDATE OR DELETE ON "eventos"."registro_acao"
  FOR EACH ROW EXECUTE FUNCTION eventos.registro_acao_somente_inclusao();
--> statement-breakpoint
CREATE TRIGGER registro_acao_sem_truncate
  BEFORE TRUNCATE ON "eventos"."registro_acao"
  FOR EACH STATEMENT EXECUTE FUNCTION eventos.registro_acao_somente_inclusao();
--> statement-breakpoint
-- Dados: a copy de escalação escolhe o gênero pela pessoa (doc 07 §11.1). Sem sexo no cadastro, a copy fica bloqueada (falta dado).
UPDATE eventos.modelo_copy
   SET corpo = replace(corpo, 'ESCALADO(A)', '{{genero:ESCALADO|ESCALADA}}'), atualizado_em = now()
 WHERE tipo = 'ESCALACAO' AND strpos(corpo, 'ESCALADO(A)') > 0;
--> statement-breakpoint
-- Dados: um modelo ativo por tipo; fica o alterado por último (mesma regra de modeloEmUso).
UPDATE eventos.modelo_copy m
   SET ativo = false, atualizado_em = now()
 WHERE m.ativo
   AND EXISTS (
     SELECT 1 FROM eventos.modelo_copy o
      WHERE o.tipo = m.tipo AND o.ativo AND (o.atualizado_em, o.id) > (m.atualizado_em, m.id)
   );
--> statement-breakpoint
-- Depois da correção acima (que deixa um ativo por tipo): o banco passa a garantir a regra.
CREATE UNIQUE INDEX "modelo_copy_ativo_unique" ON "eventos"."modelo_copy" USING btree ("tipo") WHERE "eventos"."modelo_copy"."ativo";
