-- 5. Trainee de líder: só sai se ninguém usa (pessoa habilitada ou vaga criada seguram a linha).
DELETE FROM eventos.funcao f
 WHERE f.codigo = 'TRAINEE_LIDER'
   AND NOT EXISTS (SELECT 1 FROM eventos.pessoa_funcao pf WHERE pf.funcao_id = f.id)
   AND NOT EXISTS (SELECT 1 FROM eventos.escala e WHERE e.funcao_id = f.id);

-- 4. Pai / mãe volta a ser habilitação: devolve a quem tinha (pelo histórico da 0013), se a pessoa ainda existe.
INSERT INTO eventos.pessoa_funcao (pessoa_id, funcao_id, nivel)
SELECT r.entidade_id, f.id, r.dados->>'nivel'
  FROM eventos.registro_acao r
  JOIN eventos.funcao f ON f.codigo = r.dados->>'funcao'
  JOIN core.pessoa p ON p.id = r.entidade_id
 WHERE r.entidade = 'PESSOA' AND r.acao = 'FUNCAO_RETIRADA' AND r.dados->>'migration' = '0013'
ON CONFLICT DO NOTHING;
ALTER TABLE "eventos"."funcao" DROP COLUMN IF EXISTS "cargo_do_evento";

-- 3. Situação: quem a 0013 confirmou e continua ACEITA volta ao status que tinha. Quem entrou na escala depois da
--    0013 já entrou ACEITA e fica assim (o código antigo entende).
UPDATE eventos.convocacao c SET status = r.status_de, atualizado_em = now()
  FROM eventos.registro_acao r
 WHERE r.entidade = 'CONVOCACAO' AND r.entidade_id = c.id AND r.acao = 'CONFIRMADA_PELA_MIGRACAO'
   AND r.status_de IN ('SUGERIDA', 'CONVIDADA') AND c.status = 'ACEITA';

-- 2. Deslocamento: o CHECK antigo volta a aceitar Moto, A pé e Não se aplica. Os valores que a 0013 apagou não voltam.
ALTER TABLE "eventos"."convocacao" DROP CONSTRAINT IF EXISTS "convocacao_deslocamento_check",
  ADD CONSTRAINT "convocacao_deslocamento_check" CHECK ("deslocamento" IS NULL OR "deslocamento" IN ('CARRO_PROPRIO', 'CARONA', 'CARRO_IAM', 'UBER', 'ONIBUS', 'VOO', 'MOTO', 'A_PE', 'NAO_SE_APLICA'));

-- 1. A marcação de hotel some; os quartos e quem está neles ficam.
ALTER TABLE "eventos"."convocacao" DROP COLUMN IF EXISTS "precisa_hotel";
