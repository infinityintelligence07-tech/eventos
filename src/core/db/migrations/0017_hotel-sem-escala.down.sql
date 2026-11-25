-- Desfaz a 0017. O ocupante volta a ser da convocação: quem está num quarto SEM convocação (hotel pedido antes da
-- escala) não cabe no modelo antigo, então o down para em vez de apagar essas pessoas dos quartos. A lista de quem foi
-- acrescentado na Hospedagem e a marca "também precisa de hotel" dos pedidos de voo se perdem.
DO $$
DECLARE sem_escala integer;
BEGIN
  SELECT count(*) INTO sem_escala FROM eventos.quarto_ocupante WHERE convocacao_id IS NULL;
  IF sem_escala > 0 THEN
    RAISE EXCEPTION 'down da 0017: % ocupante(s) de quarto sem convocação. Voltar tiraria essas pessoas dos quartos; não desfaça por aqui.', sem_escala;
  END IF;
END $$;

ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT IF EXISTS "quarto_ocupante_evento_pessoa_unique";
DROP INDEX IF EXISTS "eventos"."quarto_ocupante_pessoa_idx";
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT IF EXISTS "quarto_ocupante_convocacao_id_convocacao_id_fk";
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT IF EXISTS "quarto_ocupante_pessoa_id_pessoa_id_fk";
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT IF EXISTS "quarto_ocupante_evento_id_evento_id_fk";
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT IF EXISTS "quarto_ocupante_quarto_id_pessoa_id_pk";
ALTER TABLE "eventos"."quarto_ocupante" ALTER COLUMN "convocacao_id" SET NOT NULL;
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_quarto_id_convocacao_id_pk" PRIMARY KEY("quarto_id","convocacao_id");
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "eventos"."convocacao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "eventos"."quarto_ocupante" DROP COLUMN IF EXISTS "pessoa_id";
ALTER TABLE "eventos"."quarto_ocupante" DROP COLUMN IF EXISTS "evento_id";

ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "precisa_hotel";
DROP TABLE IF EXISTS eventos.hospedagem_pessoa;
