-- Funções da 0007: só saem as que ninguém usa (pessoa habilitada ou vaga criada seguram a linha).
DELETE FROM eventos.funcao f
 WHERE f.codigo IN ('LIDER_MC', 'LOGISTICA', 'TRAINER', 'MASTER_TRAINER')
   AND NOT EXISTS (SELECT 1 FROM eventos.pessoa_funcao pf WHERE pf.funcao_id = f.id)
   AND NOT EXISTS (SELECT 1 FROM eventos.escala e WHERE e.funcao_id = f.id);
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT IF EXISTS "quarto_ocupante_periodo_check",
  DROP COLUMN IF EXISTS "check_in", DROP COLUMN IF EXISTS "check_out";
-- Antes de voltar os CHECKs antigos: os valores novos deixam de existir.
UPDATE eventos.pessoa_evento SET camiseta_tamanho = NULL WHERE camiseta_tamanho = 'G1';
ALTER TABLE "eventos"."pessoa_evento" DROP CONSTRAINT IF EXISTS "pessoa_evento_camiseta_tamanho_check",
  ADD CONSTRAINT "pessoa_evento_camiseta_tamanho_check" CHECK ("camiseta_tamanho" IS NULL OR "camiseta_tamanho" IN ('PP', 'P', 'M', 'G', 'GG', 'XG'));
UPDATE eventos.convocacao SET deslocamento = NULL WHERE deslocamento IN ('MOTO', 'A_PE');
ALTER TABLE "eventos"."convocacao" DROP CONSTRAINT IF EXISTS "convocacao_deslocamento_check",
  ADD CONSTRAINT "convocacao_deslocamento_check" CHECK ("deslocamento" IS NULL OR "deslocamento" IN ('CARRO_PROPRIO', 'CARONA', 'CARRO_IAM', 'UBER', 'ONIBUS', 'VOO', 'NAO_SE_APLICA'));
