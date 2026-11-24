-- Voos e hotel pela SDC (nov/2026): nós solicitamos, a SDC compra. Só afrouxa regras e acrescenta colunas com padrão:
-- nenhuma linha existente muda nem deixa de valer.
--   1. Voos: o pedido é da pessoa no evento e vem antes da escala. Cai o índice único "um pedido de voo ativo por
--      pessoa por evento": a planilha do time tem casos reais de mais de uma compra da mesma pessoa no mesmo evento
--      (ida e volta + um trecho a mais). A tela avisa e pede confirmação antes de registrar o segundo.
--   2. Hospedagem: o time monta os quartos e a SDC escolhe o hotel, então local_id passa a aceitar vazio (hotel a
--      definir); ele é preenchido no retorno do pedido. As hospedagens que já existem continuam com o hotel delas.
--   3. Marcadores por evento, decididos pelo time e reversíveis: "não precisa de voo" (sai do aviso de voos) e "sem
--      hospedagem" (como na planilha). Todo evento existente nasce com os dois desmarcados.
--   4. Retorno da SDC: forma de pagamento do pedido (ex.: "Faturado SDC"). Vazio nos pedidos que já existem.
DROP INDEX "eventos"."pedido_sdc_voo_ativo_unique";--> statement-breakpoint
ALTER TABLE "eventos"."hospedagem" ALTER COLUMN "local_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "sem_voo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."evento" ADD COLUMN "sem_hospedagem" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD COLUMN "forma_pagamento" text;--> statement-breakpoint
ALTER TABLE "eventos"."pedido_sdc" ADD CONSTRAINT "pedido_sdc_forma_pagamento_check" CHECK ("eventos"."pedido_sdc"."forma_pagamento" IS NULL OR length("eventos"."pedido_sdc"."forma_pagamento") BETWEEN 1 AND 60);
--> statement-breakpoint
-- Privilégios (0005): o app só altera em eventos.evento as colunas que as telas mudam; os dois marcadores entram na
-- lista. E passa a poder apagar uma hospedagem aberta por engano (sem quartos e sem pedido; o serviço confere).
GRANT UPDATE (sem_voo, sem_hospedagem) ON eventos.evento TO app_eventos;
--> statement-breakpoint
GRANT DELETE ON eventos.hospedagem TO app_eventos;
