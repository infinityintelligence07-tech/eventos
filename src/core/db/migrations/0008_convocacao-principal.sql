ALTER TABLE "eventos"."convocacao" ADD COLUMN "principal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Garantia: se já houver alguém ativo em mais de uma função do mesmo evento, só a convocação mais antiga fica principal.
UPDATE eventos.convocacao c SET principal = false
 WHERE c.id IN (
   SELECT id FROM (
     SELECT c2.id, row_number() OVER (PARTITION BY e.evento_id, c2.pessoa_id ORDER BY c2.criado_em, c2.id) AS ordem
       FROM eventos.convocacao c2
       JOIN eventos.escala e ON e.id = c2.escala_id AND e.deleted_at IS NULL
      WHERE c2.status IN ('SUGERIDA', 'CONVIDADA', 'ACEITA')
   ) ativas WHERE ordem > 1
 );
