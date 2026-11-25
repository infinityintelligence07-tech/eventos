-- Hotel sem depender da escala (nov/2026): o hotel é pedido à SDC junto com o voo, até 3 meses antes, quando a escala
-- ainda não existe. Três mudanças:
--   1. pedido_sdc.precisa_hotel: "também precisa de hotel" no pedido de voo (falso em todos os pedidos que já existem).
--   2. eventos.hospedagem_pessoa: quem foi acrescentado direto na tela de Hospedagem, sem escala nem voo.
--   3. quarto_ocupante passa a ser da PESSOA no evento (evento_id + pessoa_id); a convocação vira vínculo opcional.
--      Quem ocupa quarto hoje continua no mesmo quarto, com o mesmo período: as colunas novas são preenchidas a partir
--      da convocação (pessoa) e da hospedagem do quarto (evento). Nenhuma linha é apagada.
-- A lista de quem precisa de hotel num evento é a união das três origens: convocacao.precisa_hotel (escala),
-- pedido_sdc.precisa_hotel (voo não cancelado) e hospedagem_pessoa (acrescentada na Hospedagem).
CREATE TABLE "eventos"."hospedagem_pessoa" (
	"evento_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospedagem_pessoa_evento_id_pessoa_id_pk" PRIMARY KEY("evento_id","pessoa_id")
);
--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "precisa_hotel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD COLUMN "evento_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD COLUMN "pessoa_id" uuid;--> statement-breakpoint
-- DADOS 1/2: cada ocupante ganha a pessoa (da convocação dele) e o evento (da hospedagem do quarto dele).
UPDATE eventos.quarto_ocupante o
   SET pessoa_id = c.pessoa_id,
       evento_id = h.evento_id
  FROM eventos.convocacao c, eventos.quarto q, eventos.hospedagem h
 WHERE c.id = o.convocacao_id
   AND q.id = o.quarto_id
   AND h.id = q.hospedagem_id;
--> statement-breakpoint
-- Para em vez de perder dado: ocupante sem pessoa/evento, ou a mesma pessoa em dois quartos do mesmo evento (por duas
-- convocações), precisa ser resolvido à mão antes (o app nunca gravou assim, mas a produção tem dados).
DO $$
DECLARE sem_dono integer; repetidas integer;
BEGIN
  SELECT count(*) INTO sem_dono FROM eventos.quarto_ocupante WHERE pessoa_id IS NULL OR evento_id IS NULL;
  IF sem_dono > 0 THEN
    RAISE EXCEPTION '0017: % ocupante(s) de quarto sem pessoa ou evento. Confira eventos.quarto_ocupante antes de aplicar.', sem_dono;
  END IF;
  SELECT count(*) INTO repetidas FROM (SELECT 1 FROM eventos.quarto_ocupante GROUP BY evento_id, pessoa_id HAVING count(*) > 1) duplicadas;
  IF repetidas > 0 THEN
    RAISE EXCEPTION '0017: % pessoa(s) em mais de um quarto no mesmo evento. Deixe cada pessoa em um quarto só antes de aplicar.', repetidas;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ALTER COLUMN "evento_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ALTER COLUMN "pessoa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT "quarto_ocupante_convocacao_id_convocacao_id_fk";
--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" DROP CONSTRAINT "quarto_ocupante_quarto_id_convocacao_id_pk";--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ALTER COLUMN "convocacao_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_quarto_id_pessoa_id_pk" PRIMARY KEY("quarto_id","pessoa_id");--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem_pessoa" ADD CONSTRAINT "hospedagem_pessoa_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem_pessoa" ADD CONSTRAINT "hospedagem_pessoa_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem_pessoa" ADD CONSTRAINT "hospedagem_pessoa_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "core"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hospedagem_pessoa_pessoa_idx" ON "eventos"."hospedagem_pessoa" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "hospedagem_pessoa_criado_por_idx" ON "eventos"."hospedagem_pessoa" USING btree ("criado_por");--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "core"."pessoa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "eventos"."convocacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quarto_ocupante_pessoa_idx" ON "eventos"."quarto_ocupante" USING btree ("pessoa_id");--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_evento_pessoa_unique" UNIQUE("evento_id","pessoa_id");
--> statement-breakpoint
-- DADOS 2/2: quem está num quarto e NÃO está marcado para hotel por uma convocação principal ativa do evento (saiu da
-- escala já avisado, por exemplo) fica na lista como "acrescentada na Hospedagem", para continuar no quarto com uma
-- origem. Ninguém sai de quarto nesta migration.
INSERT INTO eventos.hospedagem_pessoa (evento_id, pessoa_id)
SELECT o.evento_id, o.pessoa_id
  FROM eventos.quarto_ocupante o
 WHERE NOT EXISTS (
         SELECT 1
           FROM eventos.convocacao c
           JOIN eventos.escala e ON e.id = c.escala_id
          WHERE e.evento_id = o.evento_id
            AND e.deleted_at IS NULL
            AND c.pessoa_id = o.pessoa_id
            AND c.principal
            AND c.precisa_hotel
            AND c.status IN ('SUGERIDA', 'CONVIDADA', 'ACEITA'))
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- RLS e privilégios (0005): o app inclui e tira gente da lista; as páginas só leem. quarto_ocupante e pedido_sdc já
-- têm privilégio na tabela inteira, que vale para as colunas novas.
ALTER TABLE eventos.hospedagem_pessoa ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON eventos.hospedagem_pessoa TO app_eventos;
--> statement-breakpoint
GRANT SELECT ON eventos.hospedagem_pessoa TO app_eventos_leitura;
--> statement-breakpoint
CREATE POLICY app_eventos_escrita ON eventos.hospedagem_pessoa FOR ALL TO app_eventos USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_eventos_leitura_select ON eventos.hospedagem_pessoa FOR SELECT TO app_eventos_leitura USING (true);
