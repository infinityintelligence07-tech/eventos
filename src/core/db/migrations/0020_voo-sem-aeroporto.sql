-- Pedido de voo sem aeroporto (decisão do Vitor, 26/11/2026). O time deixa de informar o aeroporto: pede por cidade (de
-- onde a pessoa sai e a cidade do evento). Quem escolhe o aeroporto é a SDC, que informa o código ao registrar a compra.
-- Em eventos.trecho_voo:
--   1. origem_cidade e destino_cidade (texto, "Porto Alegre (RS)"): vazias em tudo que já existe.
--   2. origem_iata e destino_iata passam a ser opcionais. Quando vêm, continuam sendo 3 letras e diferentes entre si.
--   3. Cada ponta do trecho tem a cidade ou o aeroporto (trecho_voo_pontas_check): não existe trecho sem os dois.
-- Só acrescenta e afrouxa: nenhuma linha muda (os trechos que já existem ficam com o aeroporto que têm) e o código
-- anterior, que grava sempre os dois aeroportos, continua passando em todos os CHECKs até o deploy terminar.
-- Privilégios: trecho_voo tem GRANT na tabela inteira para app_eventos e app_eventos_leitura (0005) e as políticas de
-- RLS são por tabela, então as colunas novas não pedem GRANT nem política.
ALTER TABLE "eventos"."trecho_voo" DROP CONSTRAINT "trecho_voo_iata_check";--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ALTER COLUMN "origem_iata" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ALTER COLUMN "destino_iata" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ADD COLUMN "origem_cidade" text;--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ADD COLUMN "destino_cidade" text;--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ADD CONSTRAINT "trecho_voo_pontas_check" CHECK (("eventos"."trecho_voo"."origem_cidade" IS NOT NULL OR "eventos"."trecho_voo"."origem_iata" IS NOT NULL) AND ("eventos"."trecho_voo"."destino_cidade" IS NOT NULL OR "eventos"."trecho_voo"."destino_iata" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ADD CONSTRAINT "trecho_voo_cidade_check" CHECK (("eventos"."trecho_voo"."origem_cidade" IS NULL OR length("eventos"."trecho_voo"."origem_cidade") BETWEEN 2 AND 80) AND ("eventos"."trecho_voo"."destino_cidade" IS NULL OR length("eventos"."trecho_voo"."destino_cidade") BETWEEN 2 AND 80));--> statement-breakpoint
ALTER TABLE "eventos"."trecho_voo" ADD CONSTRAINT "trecho_voo_iata_check" CHECK (("eventos"."trecho_voo"."origem_iata" IS NULL OR "eventos"."trecho_voo"."origem_iata" ~ '^[A-Z]{3}$') AND ("eventos"."trecho_voo"."destino_iata" IS NULL OR "eventos"."trecho_voo"."destino_iata" ~ '^[A-Z]{3}$') AND ("eventos"."trecho_voo"."origem_iata" IS NULL OR "eventos"."trecho_voo"."destino_iata" IS NULL OR "eventos"."trecho_voo"."origem_iata" <> "eventos"."trecho_voo"."destino_iata"));