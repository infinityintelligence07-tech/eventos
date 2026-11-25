-- Voos de Masterclass (turnê) e data real da solicitação e da compra (nov/2026). Só acrescenta em eventos.pedido_sdc:
--   1. evento_volta_id: no voo de Masterclass a viagem é uma turnê. O pedido continua sendo da primeira palestra
--      (evento_id, onde a ida chega) e este é o evento da última, de onde a volta sai. Vazio em tudo que já existe.
--   2. data_solicitacao e data_compra: o dia em que o pedido foi feito à SDC e o dia em que ela comprou, informados
--      pelo time (compras antigas da planilha, compras feitas fora do sistema). solicitado_em, emitido_em e o histórico
--      continuam com a hora real do lançamento. Nos pedidos que já existem as datas saem desses instantes (DADOS, abaixo).
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "evento_volta_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "data_solicitacao" date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "data_compra" date;--> statement-breakpoint
-- DADOS: os pedidos que já existem ganham as datas de negócio a partir dos instantes de lançamento, no fuso de São
-- Paulo. A compra nunca fica antes da solicitação (o CHECK abaixo exige). Nenhuma outra coluna muda.
UPDATE eventos.pedido_sdc
   SET data_solicitacao = (solicitado_em AT TIME ZONE 'America/Sao_Paulo')::date,
       data_compra = CASE
         WHEN emitido_em IS NULL THEN NULL
         ELSE GREATEST((emitido_em AT TIME ZONE 'America/Sao_Paulo')::date, (solicitado_em AT TIME ZONE 'America/Sao_Paulo')::date)
       END;
--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_evento_volta_id_evento_id_fk" FOREIGN KEY ("evento_volta_id") REFERENCES "eventos"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_sdc_evento_volta_idx" ON "eventos"."pedido_sdc" USING btree ("evento_volta_id");--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_evento_volta_check" CHECK ("eventos"."pedido_sdc"."evento_volta_id" IS NULL OR ("eventos"."pedido_sdc"."tipo" = 'VOO' AND "eventos"."pedido_sdc"."evento_volta_id" <> "eventos"."pedido_sdc"."evento_id"));--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_data_compra_check" CHECK ("eventos"."pedido_sdc"."data_compra" IS NULL OR "eventos"."pedido_sdc"."data_compra" >= "eventos"."pedido_sdc"."data_solicitacao");
