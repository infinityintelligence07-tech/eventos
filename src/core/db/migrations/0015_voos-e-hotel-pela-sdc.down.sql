-- Desfaz a 0015. Só volta se os dados ainda cabem nas regras antigas: se já existe hospedagem sem hotel ou pessoa com
-- mais de um pedido de voo ativo no mesmo evento, para com uma mensagem clara em vez de apagar dado do time.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM eventos.hospedagem WHERE local_id IS NULL) THEN
    RAISE EXCEPTION 'down da 0015: há hospedagem sem hotel definido. Defina o hotel (ou remova a hospedagem) antes de voltar.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM eventos.pedido_sdc
     WHERE tipo = 'VOO' AND situacao <> 'CANCELADO'
     GROUP BY evento_id, pessoa_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'down da 0015: há pessoa com mais de um pedido de voo ativo no mesmo evento. Cancele os excedentes antes de voltar.';
  END IF;
END $$;

REVOKE DELETE ON eventos.hospedagem FROM app_eventos;
REVOKE UPDATE (sem_voo, sem_hospedagem) ON eventos.evento FROM app_eventos;

-- 4. A forma de pagamento registrada se perde.
ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_forma_pagamento_check";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "forma_pagamento";

-- 3. Os marcadores somem (o histórico em registro_acao fica).
ALTER TABLE "eventos"."evento" DROP COLUMN IF EXISTS "sem_hospedagem";
ALTER TABLE "eventos"."evento" DROP COLUMN IF EXISTS "sem_voo";

-- 2. e 1. As regras antigas voltam (os dados foram conferidos acima).
ALTER TABLE "eventos"."hospedagem" ALTER COLUMN "local_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "pedido_sdc_voo_ativo_unique" ON "eventos"."pedido_sdc" USING btree ("evento_id","pessoa_id") WHERE "eventos"."pedido_sdc"."tipo" = 'VOO' AND "eventos"."pedido_sdc"."situacao" <> 'CANCELADO';
