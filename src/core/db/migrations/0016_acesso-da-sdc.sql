-- Acesso da SDC e aprovação do pagamento (nov/2026): time solicita, SDC registra a compra e o valor, time aprova.
-- Só acrescenta: uma tabela nova (vazia), colunas opcionais e dois CHECKs do histórico mais largos. Nenhuma linha
-- existente muda; os pedidos já emitidos ficam "a aprovar" (aprovado_em vazio).
--   1. eventos.acesso_sdc: a lista de e-mails da agência, mantida pela líder em Configurações. A pessoa da SDC é de fora
--      da empresa: não tem core.usuario nem perfil do GH (nada é gravado no core).
--   2. pedido_sdc: quem da SDC lançou a compra (retorno_registrado_pela_sdc) e a aprovação do pagamento pelo time
--      (aprovado_em, aprovado_por, observacao_aprovacao). O banco só aceita aprovação de pedido EMITIDO com valor.
--   3. registro_acao: origem 'SDC' com acesso_sdc_id, para o histórico dizer qual e-mail da SDC fez o quê. As linhas
--      antigas (USUARIO e SISTEMA) continuam válidas nos CHECKs novos.
CREATE TABLE "eventos"."acesso_sdc" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acesso_sdc_email_unique" UNIQUE("email"),
	CONSTRAINT "acesso_sdc_email_check" CHECK ("eventos"."acesso_sdc"."email" = lower(btrim("eventos"."acesso_sdc"."email")) AND "eventos"."acesso_sdc"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' AND length("eventos"."acesso_sdc"."email") <= 254),
	CONSTRAINT "acesso_sdc_nome_check" CHECK (length(btrim("eventos"."acesso_sdc"."nome")) BETWEEN 2 AND 120)
);
--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" DROP CONSTRAINT "registro_acao_origem_check";--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" DROP CONSTRAINT "registro_acao_autoria_check";--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "retorno_registrado_pela_sdc" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "aprovado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "aprovado_por" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "observacao_aprovacao" text;--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD COLUMN "acesso_sdc_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."acesso_sdc" ADD CONSTRAINT "acesso_sdc_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acesso_sdc_criado_por_idx" ON "eventos"."acesso_sdc" USING btree ("criado_por");--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_retorno_registrado_pela_sdc_acesso_sdc_id_fk" FOREIGN KEY ("retorno_registrado_pela_sdc") REFERENCES "eventos"."acesso_sdc"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_aprovado_por_usuario_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_acesso_sdc_id_acesso_sdc_id_fk" FOREIGN KEY ("acesso_sdc_id") REFERENCES "eventos"."acesso_sdc"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_sdc_retorno_pela_sdc_idx" ON "eventos"."pedido_sdc" USING btree ("retorno_registrado_pela_sdc");--> statement-breakpoint
CREATE INDEX "pedido_sdc_aprovado_por_idx" ON "eventos"."pedido_sdc" USING btree ("aprovado_por");--> statement-breakpoint
CREATE INDEX "registro_acao_acesso_sdc_idx" ON "eventos"."registro_acao" USING btree ("acesso_sdc_id");--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_aprovacao_check" CHECK ("eventos"."pedido_sdc"."aprovado_em" IS NULL OR ("eventos"."pedido_sdc"."situacao" = 'EMITIDO' AND "eventos"."pedido_sdc"."valor_centavos" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_aprovacao_obs_check" CHECK ("eventos"."pedido_sdc"."observacao_aprovacao" IS NULL OR ("eventos"."pedido_sdc"."aprovado_em" IS NOT NULL AND length("eventos"."pedido_sdc"."observacao_aprovacao") <= 500));--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_origem_check" CHECK ("eventos"."registro_acao"."origem" IN ('USUARIO', 'SISTEMA', 'SDC'));--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_autoria_check" CHECK (("eventos"."registro_acao"."origem" = 'USUARIO') = ("eventos"."registro_acao"."usuario_id" IS NOT NULL) AND ("eventos"."registro_acao"."origem" = 'SDC') = ("eventos"."registro_acao"."acesso_sdc_id" IS NOT NULL));
--> statement-breakpoint
-- RLS e privilégios (0005): mínimo para cada papel. O app inclui e-mails e só altera nome e ativo (o e-mail não muda:
-- para trocar, desativa-se um e inclui-se outro) e não apaga (o histórico aponta para a linha). As páginas só leem
-- (a resolução de quem entrou lê a lista a cada requisição). O papel do worker e o da cópia local não enxergam a tabela.
ALTER TABLE eventos.acesso_sdc ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON eventos.acesso_sdc TO app_eventos;
--> statement-breakpoint
GRANT UPDATE (nome, ativo, atualizado_em) ON eventos.acesso_sdc TO app_eventos;
--> statement-breakpoint
GRANT SELECT ON eventos.acesso_sdc TO app_eventos_leitura;
--> statement-breakpoint
CREATE POLICY app_eventos_escrita ON eventos.acesso_sdc FOR ALL TO app_eventos USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_eventos_leitura_select ON eventos.acesso_sdc FOR SELECT TO app_eventos_leitura USING (true);
