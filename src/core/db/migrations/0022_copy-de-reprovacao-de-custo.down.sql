-- Desfaz a 0022: apaga os modelos de reprovação de custo e devolve o CHECK aos quatro tipos da escala.
DELETE FROM eventos.modelo_copy WHERE tipo = 'REPROVACAO_CUSTO';
ALTER TABLE "eventos"."modelo_copy" DROP CONSTRAINT "modelo_copy_tipo_check";
ALTER TABLE "eventos"."modelo_copy" ADD CONSTRAINT "modelo_copy_tipo_check" CHECK ("eventos"."modelo_copy"."tipo" IN ('ESCALACAO', 'HOSPEDAGEM', 'LEMBRETE', 'ALTERACAO'));
