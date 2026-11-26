-- Desfaz a 0020. Trecho pedido só com as cidades (sem aeroporto) não cabe no modelo antigo, em que os dois aeroportos
-- são obrigatórios: o down para em vez de apagar esses trechos. Nos demais, perdem-se as cidades de origem e de destino
-- (o aeroporto continua lá).
DO $$
DECLARE sem_aeroporto integer;
BEGIN
  SELECT count(*) INTO sem_aeroporto FROM eventos.trecho_voo WHERE origem_iata IS NULL OR destino_iata IS NULL;
  IF sem_aeroporto > 0 THEN
    RAISE EXCEPTION 'down da 0020: % trecho(s) de voo sem aeroporto. Voltar exigiria apagar esses trechos; não desfaça por aqui.', sem_aeroporto;
  END IF;
END $$;

ALTER TABLE "eventos"."trecho_voo" DROP CONSTRAINT IF EXISTS "trecho_voo_cidade_check";
ALTER TABLE "eventos"."trecho_voo" DROP CONSTRAINT IF EXISTS "trecho_voo_pontas_check";
ALTER TABLE "eventos"."trecho_voo" DROP CONSTRAINT IF EXISTS "trecho_voo_iata_check";
ALTER TABLE "eventos"."trecho_voo" DROP COLUMN IF EXISTS "destino_cidade";
ALTER TABLE "eventos"."trecho_voo" DROP COLUMN IF EXISTS "origem_cidade";
ALTER TABLE "eventos"."trecho_voo" ALTER COLUMN "destino_iata" SET NOT NULL;
ALTER TABLE "eventos"."trecho_voo" ALTER COLUMN "origem_iata" SET NOT NULL;
ALTER TABLE "eventos"."trecho_voo" ADD CONSTRAINT "trecho_voo_iata_check" CHECK ("eventos"."trecho_voo"."origem_iata" ~ '^[A-Z]{3}$' AND "eventos"."trecho_voo"."destino_iata" ~ '^[A-Z]{3}$' AND "eventos"."trecho_voo"."origem_iata" <> "eventos"."trecho_voo"."destino_iata");
