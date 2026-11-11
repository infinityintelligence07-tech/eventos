-- Volta os privilégios do worker no schema eventos. O papel fica: é do cluster e pode ter privilégio no schema core
-- (migration do GH). Depois de reverter a do GH: DROP ROLE app_eventos_worker;
DO $$
DECLARE politica record;
BEGIN
  FOR politica IN
    SELECT tablename, policyname FROM pg_catalog.pg_policies
     WHERE schemaname = 'eventos'
       AND policyname IN ('app_eventos_worker_select', 'app_eventos_worker_escrita', 'app_eventos_worker_historico_insert')
  LOOP
    EXECUTE format('DROP POLICY %I ON eventos.%I', politica.policyname, politica.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM app_eventos_worker;
REVOKE ALL ON SCHEMA eventos FROM app_eventos_worker;
REVOKE EXECUTE ON FUNCTION public.uuid_v7() FROM app_eventos_worker;
