-- Desfaz a 0018. Os locais continuam todos lá, com nome, tipo e endereço como estão; perde-se só a marca de origem
-- (ao aplicar de novo, a 0018 e a sincronização seguinte refazem a marca).
ALTER TABLE "eventos"."local" DROP CONSTRAINT IF EXISTS "local_iam_control_endereco_check";
ALTER TABLE "eventos"."local" DROP CONSTRAINT IF EXISTS "local_origem_check";
DROP INDEX IF EXISTS "eventos"."local_iam_control_endereco_idx";
ALTER TABLE "eventos"."local" DROP COLUMN IF EXISTS "iam_control_endereco_id";
ALTER TABLE "eventos"."local" DROP COLUMN IF EXISTS "origem";
