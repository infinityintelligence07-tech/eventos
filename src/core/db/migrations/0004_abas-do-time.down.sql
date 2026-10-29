DROP INDEX IF EXISTS "eventos"."modelo_copy_ativo_unique";
-- Dados: volta o texto antigo da copy de escalação. Modelos desativados pela 0004 não são reativados.
UPDATE eventos.modelo_copy SET corpo = replace(corpo, '{{genero:ESCALADO|ESCALADA}}', 'ESCALADO(A)'), atualizado_em = now()
 WHERE tipo = 'ESCALACAO';
-- Antes de voltar: escalas em AGUARDANDO_APROVACAO/DEVOLVIDA precisam virar RASCUNHO, senão o CHECK antigo falha.
UPDATE eventos.evento SET status_escala = 'RASCUNHO' WHERE status_escala IN ('AGUARDANDO_APROVACAO', 'DEVOLVIDA');
DROP TABLE IF EXISTS "eventos"."quarto_ocupante", "eventos"."quarto", "eventos"."hospedagem", "eventos"."trecho_voo",
  "eventos"."pedido_sdc", "eventos"."registro_acao", "eventos"."configuracao" CASCADE;
DROP SEQUENCE IF EXISTS "eventos"."pedido_sdc_referencia_seq";
DROP FUNCTION IF EXISTS eventos.registro_acao_somente_inclusao();
ALTER TABLE "eventos"."mensagem" DROP CONSTRAINT IF EXISTS "mensagem_enviada_check";
ALTER TABLE "eventos"."convocacao" DROP CONSTRAINT IF EXISTS "convocacao_status_check", DROP COLUMN IF EXISTS "registrado_por";
ALTER TABLE "eventos"."disponibilidade" DROP COLUMN IF EXISTS "registrado_por";
ALTER TABLE "eventos"."solicitacao_custo" DROP COLUMN IF EXISTS "registrado_por";
ALTER TABLE "eventos"."escala" DROP CONSTRAINT IF EXISTS "escala_confirmada_check",
  DROP COLUMN IF EXISTS "confirmada_em", DROP COLUMN IF EXISTS "confirmada_por";
ALTER TABLE "eventos"."evento" DROP CONSTRAINT IF EXISTS "evento_status_escala_check",
  ADD CONSTRAINT "evento_status_escala_check" CHECK ("status_escala" IN ('SEM_ESCALA', 'RASCUNHO', 'APROVADA', 'COMUNICADA'));
