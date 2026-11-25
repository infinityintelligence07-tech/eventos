-- Desfaz a 0019. Perdem-se o evento da volta dos voos de Masterclass (o pedido fica só com a primeira palestra) e as
-- datas informadas de solicitação e de compra (as telas voltam a mostrar o dia do lançamento, que continua guardado
-- em solicitado_em e emitido_em).
ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_data_compra_check";
ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_evento_volta_check";
DROP INDEX IF EXISTS "eventos"."pedido_sdc_evento_volta_idx";
ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_evento_volta_id_evento_id_fk";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "data_compra";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "data_solicitacao";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "evento_volta_id";
