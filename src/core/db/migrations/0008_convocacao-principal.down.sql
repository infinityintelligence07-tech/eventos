-- Antes de voltar: o código antigo não aceita a mesma pessoa em duas funções do mesmo evento. As convocações
-- secundárias ativas viram CANCELADA (a principal fica), senão as telas de logística mostrariam a pessoa em dobro.
UPDATE eventos.convocacao SET status = 'CANCELADA', atualizado_em = now()
 WHERE NOT principal AND status IN ('SUGERIDA', 'CONVIDADA', 'ACEITA');
ALTER TABLE "eventos"."convocacao" DROP COLUMN IF EXISTS "principal";
