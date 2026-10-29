-- Papéis de banco do Eventos com o mínimo de privilégio (doc 09 §6, M4).
-- Os papéis nascem NOLOGIN e sem senha: LOGIN, senha e o marcador `producao` são ação manual no iam-pessoas
-- (doc 09 §11, Vitor). No banco local, o banco:local faz isso com senha gerada em .banco-local/.
-- O que é do schema core (USAGE, SELECT por coluna e políticas) é migration do GH-System:
-- proposta em docs/gh-proposta-papeis-do-eventos.sql, aplicada depois desta.
-- Tabela nova no schema eventos precisa, na própria migration, do GRANT e das políticas abaixo (sem privilégio padrão).

-- 1. Papéis (do cluster; outra sessão pode criá-los em paralelo, como nos testes).
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['app_eventos', 'app_eventos_leitura', 'app_eventos_copia'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = papel) THEN
      BEGIN
        EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS', papel);
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- 2. Configurações dos papéis (só grava o que ainda não está gravado).
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('app_eventos_leitura', 'default_transaction_read_only', 'on'),
      ('app_eventos_leitura', 'statement_timeout', '15s'),
      ('app_eventos_copia', 'default_transaction_read_only', 'on')
    ) AS v(papel, parametro, valor)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_db_role_setting s JOIN pg_catalog.pg_roles r ON r.oid = s.setrole
       WHERE r.rolname = item.papel AND s.setdatabase = 0 AND (item.parametro || '=' || item.valor) = ANY (s.setconfig)
    ) THEN
      EXECUTE format('ALTER ROLE %I SET %s = %L', item.papel, item.parametro, item.valor);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- 3. Schema e funções.
GRANT USAGE ON SCHEMA eventos TO app_eventos, app_eventos_leitura, app_eventos_copia;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA eventos TO app_eventos;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION eventos.proximo_protocolo() TO app_eventos;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.uuid_v7() TO app_eventos;
--> statement-breakpoint
-- 4. app_eventos (escrita). presenca é do GH: o Eventos só lê (histórico da ficha de Pessoas).
GRANT SELECT, INSERT, UPDATE ON
  eventos.carona, eventos.configuracao, eventos.convocacao, eventos.custo_item, eventos.deslocamento,
  eventos.disponibilidade, eventos.enquete, eventos.enquete_evento, eventos.escala,
  eventos.hospedagem, eventos.mensagem, eventos.modelo_copy, eventos.pedido_sdc, eventos.pessoa_evento,
  eventos.pessoa_funcao, eventos.pessoa_veiculo, eventos.protocolo_sequencia, eventos.quarto, eventos.quarto_ocupante,
  eventos.regra_custo, eventos.rota_cache, eventos.solicitacao_custo, eventos.trecho_voo
TO app_eventos;
--> statement-breakpoint
-- Cadastros que a sincronização de turmas mantém (doc 09, revisão B4): o app não cria evento nem função e só
-- altera as colunas que as telas mudam. Código, turma, datas, polo, status e sincronizado_em são da sincronização.
-- (SELECT ... FOR UPDATE precisa de UPDATE em alguma coluna: evento, tipo_evento e local são travados pelo app.)
GRANT SELECT ON eventos.evento, eventos.tipo_evento, eventos.funcao, eventos.local TO app_eventos;
--> statement-breakpoint
GRANT UPDATE (status_escala, aprovado_por, aprovado_em, expectativa_publico, pessoas_na_fila, atualizado_em)
  ON eventos.evento TO app_eventos;
--> statement-breakpoint
GRANT UPDATE (regra_vagas, atualizado_em) ON eventos.tipo_evento TO app_eventos;
--> statement-breakpoint
-- Locais e hotéis são cadastrados pelo time (Configurações › Locais). INSERT na tabela inteira: o Drizzle lista todas
-- as colunas no INSERT (com DEFAULT nas que não recebe), e privilégio de INSERT por coluna recusaria isso.
GRANT INSERT ON eventos.local TO app_eventos;
--> statement-breakpoint
GRANT UPDATE (nome, tipo, logradouro, numero, complemento, bairro, cidade, uf, cep, lat, lng, capacidade, atualizado_em, deleted_at)
  ON eventos.local TO app_eventos;
--> statement-breakpoint
-- DELETE só onde o código apaga (rg "\.delete\(" src/modules).
GRANT DELETE ON
  eventos.convocacao, eventos.disponibilidade, eventos.deslocamento, eventos.custo_item, eventos.carona,
  eventos.quarto, eventos.quarto_ocupante, eventos.trecho_voo, eventos.pessoa_funcao, eventos.pessoa_veiculo
TO app_eventos;
--> statement-breakpoint
-- Histórico só de inclusão (o trigger da 0004 recusa até para o dono).
GRANT SELECT, INSERT ON eventos.registro_acao TO app_eventos;
--> statement-breakpoint
-- 5. app_eventos_leitura (páginas): só SELECT.
GRANT SELECT ON
  eventos.carona, eventos.configuracao, eventos.convocacao, eventos.custo_item, eventos.deslocamento,
  eventos.disponibilidade, eventos.enquete, eventos.enquete_evento, eventos.escala, eventos.evento, eventos.funcao,
  eventos.hospedagem, eventos.local, eventos.mensagem, eventos.modelo_copy, eventos.pedido_sdc, eventos.pessoa_evento,
  eventos.pessoa_funcao, eventos.pessoa_veiculo, eventos.protocolo_sequencia, eventos.quarto, eventos.quarto_ocupante,
  eventos.regra_custo, eventos.rota_cache, eventos.solicitacao_custo, eventos.tipo_evento, eventos.trecho_voo,
  eventos.registro_acao
TO app_eventos_leitura;
--> statement-breakpoint
-- 6. app_eventos_copia (banco:local): só as tabelas copiadas (core.polo vem pela migration do GH).
GRANT SELECT ON
  eventos.local, eventos.evento, eventos.escala, eventos.tipo_evento, eventos.funcao, eventos.regra_custo, eventos.modelo_copy
TO app_eventos_copia;
--> statement-breakpoint
-- 7. RLS: as tabelas têm RLS ligada sem políticas (0002/0004). Política explícita por papel (doc 09 §6.2, opção b).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'carona', 'configuracao', 'convocacao', 'custo_item', 'deslocamento', 'disponibilidade', 'enquete', 'enquete_evento',
    'escala', 'evento', 'funcao', 'hospedagem', 'local', 'mensagem', 'modelo_copy', 'pedido_sdc', 'pessoa_evento',
    'pessoa_funcao', 'pessoa_veiculo', 'protocolo_sequencia', 'quarto', 'quarto_ocupante', 'regra_custo', 'rota_cache',
    'solicitacao_custo', 'tipo_evento', 'trecho_voo'
  ] LOOP
    EXECUTE format('CREATE POLICY app_eventos_escrita ON eventos.%I FOR ALL TO app_eventos USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY app_eventos_leitura_select ON eventos.%I FOR SELECT TO app_eventos_leitura USING (true)', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['local', 'evento', 'escala', 'tipo_evento', 'funcao', 'regra_custo', 'modelo_copy'] LOOP
    EXECUTE format('CREATE POLICY app_eventos_copia_select ON eventos.%I FOR SELECT TO app_eventos_copia USING (true)', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY app_eventos_historico_select ON eventos.registro_acao FOR SELECT TO app_eventos USING (true);
--> statement-breakpoint
CREATE POLICY app_eventos_historico_insert ON eventos.registro_acao FOR INSERT TO app_eventos WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_eventos_leitura_select ON eventos.registro_acao FOR SELECT TO app_eventos_leitura USING (true);
--> statement-breakpoint
-- presenca (tabela do GH): só leitura para os dois papéis do app.
GRANT SELECT ON eventos.presenca TO app_eventos, app_eventos_leitura;
--> statement-breakpoint
CREATE POLICY app_eventos_historico_select ON eventos.presenca FOR SELECT TO app_eventos USING (true);
--> statement-breakpoint
CREATE POLICY app_eventos_leitura_select ON eventos.presenca FOR SELECT TO app_eventos_leitura USING (true);
