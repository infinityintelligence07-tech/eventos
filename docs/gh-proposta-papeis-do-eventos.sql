-- PROPOSTA para o GH-System (dono do schema core): migration com os perfis do Eventos e o acesso de leitura
-- dos papéis do Eventos ao core (doc 09 §6.3 e §11, Lucas). Não é migration do Eventos.
-- Ordem: aplicar DEPOIS da 0005_papeis-do-app do Eventos (que cria os papéis). Idempotente.
-- O banco:local e os testes de integração do Eventos aplicam este arquivo para exercitar os grants.
-- Colunas: só o que o Eventos lê (rg "core\." src). Fora de propósito: data_nascimento, foto, remuneração do vínculo
-- e qualquer tabela de sensivel, gh e auditoria.

-- Perfis (doc 09 §3, L4). O GH ignora códigos que não conhece.
INSERT INTO core.perfil (codigo, nome) VALUES
  ('EVENTOS_TIME', 'Eventos: time'),
  ('EVENTOS_LIDER', 'Eventos: líder')
ON CONFLICT (codigo) DO NOTHING;

GRANT USAGE ON SCHEMA core TO app_eventos, app_eventos_leitura, app_eventos_copia;

GRANT SELECT (id, usuario_id, nome_completo, nome_social, email, telefone, ativo, deleted_at)
  ON core.pessoa TO app_eventos, app_eventos_leitura;
GRANT SELECT (id, email, nome_usuario, ativo, deleted_at)
  ON core.usuario TO app_eventos, app_eventos_leitura;
GRANT SELECT (id, pessoa_id, tipo, polo_id, status, data_inicio, data_fim, deleted_at)
  ON core.vinculo TO app_eventos, app_eventos_leitura;
-- cargo: nome da função em escalas antigas do GH (escala.cargo_id).
GRANT SELECT (id, nome) ON core.cargo TO app_eventos, app_eventos_leitura;
GRANT SELECT ON core.polo TO app_eventos, app_eventos_leitura, app_eventos_copia;
GRANT SELECT ON core.perfil, core.usuario_perfil TO app_eventos, app_eventos_leitura;

-- RLS ligada sem políticas no core: política explícita de SELECT por papel.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuario', 'vinculo', 'cargo', 'polo', 'perfil', 'usuario_perfil'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS eventos_select ON core.%I', t);
    EXECUTE format('CREATE POLICY eventos_select ON core.%I FOR SELECT TO app_eventos, app_eventos_leitura USING (true)', t);
  END LOOP;
  DROP POLICY IF EXISTS eventos_copia_select ON core.polo;
  CREATE POLICY eventos_copia_select ON core.polo FOR SELECT TO app_eventos_copia USING (true);
END $$;

-- core.pessoa: só as pessoas ligadas ao Eventos (revisão M3), não o quadro inteiro da IAM com telefone e e-mail.
-- É o que o código lê (rg "pessoa" src/modules src/core/auth):
--   1. staff: tem eventos.pessoa_evento (listas, ficha, escala, convocação, custo, voo, carona, disponibilidade —
--      o app só convoca e registra para quem tem pessoa_evento);
--   2. quem usa o Eventos: usuário com perfil EVENTOS_TIME/EVENTOS_LIDER (nome do ator no cabeçalho);
--   3. quem já agiu no Eventos: autor de registro_acao (nome no histórico mesmo depois de perder o perfil).
-- core.usuario continua sem filtro: o login procura o usuário pelo e-mail antes de saber se ele tem perfil.
-- Depende de eventos.pessoa_evento e eventos.registro_acao (migrations 0001 e 0004 do Eventos).
DROP POLICY IF EXISTS eventos_select ON core.pessoa;
CREATE POLICY eventos_select ON core.pessoa FOR SELECT TO app_eventos, app_eventos_leitura USING (
  EXISTS (SELECT 1 FROM eventos.pessoa_evento pe WHERE pe.pessoa_id = pessoa.id)
  OR (
    pessoa.usuario_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM core.usuario_perfil up JOIN core.perfil pf ON pf.id = up.perfil_id
         WHERE up.usuario_id = pessoa.usuario_id AND pf.codigo IN ('EVENTOS_TIME', 'EVENTOS_LIDER')
      )
      OR EXISTS (SELECT 1 FROM eventos.registro_acao ra WHERE ra.usuario_id = pessoa.usuario_id)
    )
  )
);
