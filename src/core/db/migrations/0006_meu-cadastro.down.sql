ALTER TABLE "eventos"."pessoa_evento" DROP CONSTRAINT IF EXISTS "pessoa_evento_uf_check";
ALTER TABLE "eventos"."pessoa_evento" DROP CONSTRAINT IF EXISTS "pessoa_evento_cep_check";
DROP INDEX IF EXISTS "eventos"."pessoa_evento_polo_idx";
ALTER TABLE "eventos"."pessoa_evento" DROP CONSTRAINT IF EXISTS "pessoa_evento_polo_id_polo_id_fk";
ALTER TABLE "eventos"."pessoa_evento" DROP COLUMN IF EXISTS "uf", DROP COLUMN IF EXISTS "cidade", DROP COLUMN IF EXISTS "cep", DROP COLUMN IF EXISTS "polo_id";
