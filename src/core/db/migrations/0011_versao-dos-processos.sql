CREATE TABLE "eventos"."processo" (
	"nome" text PRIMARY KEY NOT NULL,
	"versao" text NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processo_nome_check" CHECK ("eventos"."processo"."nome" ~ '^[a-z][a-z0-9_-]{1,39}$')
);
--> statement-breakpoint
-- Mesmo padrão das outras tabelas (0004/0005/0009): RLS ligada e política explícita por papel.
ALTER TABLE eventos.processo ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- O worker anota a própria versão ao subir; o site só lê (rota /api/versao).
GRANT SELECT, INSERT, UPDATE ON eventos.processo TO app_eventos_worker;
--> statement-breakpoint
GRANT SELECT ON eventos.processo TO app_eventos, app_eventos_leitura;
--> statement-breakpoint
CREATE POLICY app_eventos_worker_escrita ON eventos.processo FOR ALL TO app_eventos_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_eventos_select ON eventos.processo FOR SELECT TO app_eventos USING (true);
--> statement-breakpoint
CREATE POLICY app_eventos_leitura_select ON eventos.processo FOR SELECT TO app_eventos_leitura USING (true);
