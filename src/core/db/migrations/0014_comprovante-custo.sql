-- Comprovantes do formulário de custo do staff (docs/08 §11.4). Só acrescenta: uma tabela nova, vazia, e um valor a
-- mais no CHECK das entidades do histórico. Nenhuma linha existente muda.
--   eventos.comprovante_custo: um anexo por linha. O arquivo fica no armazenamento (Storage, bucket privado); aqui
--   ficam a chave dele, o nome original, o tipo conferido pelos bytes, o tamanho e quem enviou. É da solicitação
--   (solicitacao_id, preenchido quando ela é registrada) e, antes disso, da pessoa naquele evento (evento_id + pessoa_id).
--   As colunas antigas comprovante_url (deslocamento e custo_item) ficam como estão.
CREATE TABLE "eventos"."comprovante_custo" (
	"id" uuid PRIMARY KEY DEFAULT public.uuid_v7() NOT NULL,
	"evento_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"solicitacao_id" uuid,
	"chave" text NOT NULL,
	"nome_original" text NOT NULL,
	"tipo" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"enviado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comprovante_custo_chave_unique" UNIQUE("chave"),
	CONSTRAINT "comprovante_custo_tipo_check" CHECK ("eventos"."comprovante_custo"."tipo" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
	CONSTRAINT "comprovante_custo_tamanho_check" CHECK ("eventos"."comprovante_custo"."tamanho_bytes" > 0),
	CONSTRAINT "comprovante_custo_nome_check" CHECK (length("eventos"."comprovante_custo"."nome_original") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" DROP CONSTRAINT "registro_acao_entidade_check";--> statement-breakpoint
ALTER TABLE "eventos"."comprovante_custo" ADD CONSTRAINT "comprovante_custo_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."comprovante_custo" ADD CONSTRAINT "comprovante_custo_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."comprovante_custo" ADD CONSTRAINT "comprovante_custo_solicitacao_id_solicitacao_custo_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "eventos"."solicitacao_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."comprovante_custo" ADD CONSTRAINT "comprovante_custo_enviado_por_usuario_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comprovante_custo_evento_pessoa_idx" ON "eventos"."comprovante_custo" USING btree ("evento_id","pessoa_id");--> statement-breakpoint
CREATE INDEX "comprovante_custo_pessoa_idx" ON "eventos"."comprovante_custo" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "comprovante_custo_solicitacao_idx" ON "eventos"."comprovante_custo" USING btree ("solicitacao_id");--> statement-breakpoint
CREATE INDEX "comprovante_custo_enviado_por_idx" ON "eventos"."comprovante_custo" USING btree ("enviado_por");--> statement-breakpoint
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_entidade_check" CHECK ("eventos"."registro_acao"."entidade" IN ('ESCALA_DO_EVENTO', 'CONVOCACAO', 'MENSAGEM', 'DISPONIBILIDADE', 'SOLICITACAO_CUSTO', 'COMPROVANTE_CUSTO', 'PEDIDO_SDC', 'HOSPEDAGEM', 'CARONA', 'REGRA_CUSTO', 'MODELO_COPY', 'TIPO_EVENTO', 'CONFIGURACAO', 'PESSOA', 'LOCAL', 'ENQUETE', 'EVENTO', 'VAGA'));
--> statement-breakpoint
-- RLS e privilégios como nas outras tabelas de custos (0005): o app grava e apaga (a pessoa troca o anexo ao corrigir),
-- as páginas só leem. O papel do worker e o da cópia local não enxergam a tabela.
ALTER TABLE eventos.comprovante_custo ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON eventos.comprovante_custo TO app_eventos;
--> statement-breakpoint
GRANT SELECT ON eventos.comprovante_custo TO app_eventos_leitura;
--> statement-breakpoint
CREATE POLICY app_eventos_escrita ON eventos.comprovante_custo FOR ALL TO app_eventos USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_eventos_leitura_select ON eventos.comprovante_custo FOR SELECT TO app_eventos_leitura USING (true);
