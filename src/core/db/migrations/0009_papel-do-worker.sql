-- Papel próprio da sincronização de turmas (doc 09 §6.1): o worker deixa de usar o dono do banco (postgres).
-- Só o que a sincronização faz: cria e atualiza evento, local e vagas (escala), e inclui no histórico como SISTEMA.
-- Nasce NOLOGIN e sem senha: LOGIN e senha são ação manual no iam-pessoas (doc 09 §11).
-- A leitura de core.polo é migration do GH: docs/gh-proposta-papeis-do-eventos.sql.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_eventos_worker') THEN
    BEGIN
      CREATE ROLE app_eventos_worker NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN
      NULL;
    END;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA eventos TO app_eventos_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.uuid_v7() TO app_eventos_worker;
--> statement-breakpoint
-- Lê a regra de vagas do tipo, as funções e se a linha da escala já tem gente (não recalcula por cima).
GRANT SELECT ON eventos.tipo_evento, eventos.funcao, eventos.convocacao TO app_eventos_worker;
--> statement-breakpoint
-- Sem DELETE: evento cancelado e vaga removida são marcados, nunca apagados.
GRANT SELECT, INSERT, UPDATE ON eventos.evento, eventos.local, eventos.escala TO app_eventos_worker;
--> statement-breakpoint
GRANT INSERT ON eventos.registro_acao TO app_eventos_worker;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tipo_evento', 'funcao', 'convocacao'] LOOP
    EXECUTE format('CREATE POLICY app_eventos_worker_select ON eventos.%I FOR SELECT TO app_eventos_worker USING (true)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['evento', 'local', 'escala'] LOOP
    EXECUTE format('CREATE POLICY app_eventos_worker_escrita ON eventos.%I FOR ALL TO app_eventos_worker USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY app_eventos_worker_historico_insert ON eventos.registro_acao FOR INSERT TO app_eventos_worker WITH CHECK (true);
