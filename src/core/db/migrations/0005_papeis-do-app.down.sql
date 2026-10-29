-- Volta os privilégios do schema eventos. Os papéis ficam: são do cluster e podem ter privilégios no schema core
-- (migration do GH). Depois de reverter a do GH: DROP ROLE app_eventos, app_eventos_leitura, app_eventos_copia;
DO $$
DECLARE politica record;
BEGIN
  FOR politica IN
    SELECT tablename, policyname FROM pg_catalog.pg_policies
     WHERE schemaname = 'eventos'
       AND policyname IN ('app_eventos_escrita', 'app_eventos_leitura_select', 'app_eventos_copia_select',
                          'app_eventos_historico_select', 'app_eventos_historico_insert')
  LOOP
    EXECUTE format('DROP POLICY %I ON eventos.%I', politica.policyname, politica.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM app_eventos, app_eventos_leitura, app_eventos_copia;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA eventos FROM app_eventos, app_eventos_leitura, app_eventos_copia;
REVOKE ALL ON SCHEMA eventos FROM app_eventos, app_eventos_leitura, app_eventos_copia;
REVOKE EXECUTE ON FUNCTION eventos.proximo_protocolo() FROM app_eventos;
REVOKE EXECUTE ON FUNCTION public.uuid_v7() FROM app_eventos;
ALTER ROLE app_eventos_leitura RESET ALL;
ALTER ROLE app_eventos_copia RESET ALL;
