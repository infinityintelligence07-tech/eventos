-- Configurações › Acesso do time: a líder concede e retira os perfis do Eventos pela tela.
-- core.usuario_perfil é do GH e o app_eventos só a lê. Em vez de dar INSERT/DELETE na tabela inteira (o que deixaria
-- o app mexer em perfis de outros sistemas), a escrita passa por esta função, que só faz o que a tela precisa:
--   * só os perfis EVENTOS_TIME e EVENTOS_LIDER, sempre com escopo GLOBAL;
--   * quem pede tem de ser líder ativa do Eventos (segunda conferência; a primeira é a permissão no app);
--   * ninguém altera o próprio acesso (a líder não se tranca para fora nem fica sem outra líder);
--   * conceder exige usuário ativo; retirar vale também para quem já foi desativado.
-- Devolve os perfis do Eventos que o usuário tinha antes, para o histórico.
CREATE FUNCTION eventos.definir_perfis_do_eventos(p_ator uuid, p_usuario uuid, p_perfis text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_do_eventos constant text[] := ARRAY['EVENTOS_TIME', 'EVENTOS_LIDER'];
  v_anteriores text[];
  v_ativo boolean;
BEGIN
  IF p_ator IS NULL OR p_usuario IS NULL OR p_perfis IS NULL OR NOT (p_perfis <@ v_do_eventos) THEN
    RAISE EXCEPTION 'perfil fora do Eventos' USING ERRCODE = '22023';
  END IF;
  IF p_ator = p_usuario THEN
    RAISE EXCEPTION 'ninguém altera o próprio acesso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM core.usuario_perfil up
      JOIN core.perfil pf ON pf.id = up.perfil_id
      JOIN core.usuario u ON u.id = up.usuario_id
     WHERE up.usuario_id = p_ator AND up.escopo = 'GLOBAL' AND pf.codigo = 'EVENTOS_LIDER'
       AND u.ativo AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'só a líder do Eventos altera o acesso do time' USING ERRCODE = '42501';
  END IF;

  -- Uma mudança por vez para o mesmo usuário.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('eventos.acesso:' || p_usuario::text, 0));

  SELECT (u.ativo AND u.deleted_at IS NULL) INTO v_ativo FROM core.usuario u WHERE u.id = p_usuario;
  IF v_ativo IS NULL THEN
    RAISE EXCEPTION 'usuário não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF pg_catalog.cardinality(p_perfis) > 0 AND NOT v_ativo THEN
    RAISE EXCEPTION 'usuário inativo não recebe acesso' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(pf.codigo ORDER BY pf.codigo) INTO v_anteriores
    FROM core.usuario_perfil up
    JOIN core.perfil pf ON pf.id = up.perfil_id
   WHERE up.usuario_id = p_usuario AND up.escopo = 'GLOBAL' AND pf.codigo = ANY (v_do_eventos);

  DELETE FROM core.usuario_perfil up
   USING core.perfil pf
   WHERE pf.id = up.perfil_id AND up.usuario_id = p_usuario
     AND pf.codigo = ANY (v_do_eventos) AND NOT (pf.codigo = ANY (p_perfis));

  INSERT INTO core.usuario_perfil (usuario_id, perfil_id, escopo, escopo_ref)
  SELECT p_usuario, pf.id, 'GLOBAL', NULL FROM core.perfil pf WHERE pf.codigo = ANY (p_perfis)
  ON CONFLICT (usuario_id, perfil_id) DO UPDATE SET escopo = 'GLOBAL', escopo_ref = NULL;

  RETURN COALESCE(v_anteriores, ARRAY[]::text[]);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION eventos.definir_perfis_do_eventos(uuid, uuid, text[]) FROM PUBLIC;
--> statement-breakpoint
-- Papéis da API do Supabase, quando existem: a função não é para eles.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION eventos.definir_perfis_do_eventos(uuid, uuid, text[]) FROM %I', papel);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION eventos.definir_perfis_do_eventos(uuid, uuid, text[]) TO app_eventos;
