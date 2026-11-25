-- Locais e hotéis vindos do IAM Control (nov/2026). O cadastro de locais do Eventos passa a ter origem:
--   EVENTOS      = cadastrado pelo time (ou pela SDC, no retorno da hospedagem). É o padrão de toda linha que já existe.
--   IAM_CONTROL  = veio dos locais das turmas; a sincronização mantém nome e endereço e o time não os edita na tela.
-- iam_control_endereco_id guarda o id do local no IAM Control (endereco_eventos.id). Fica vazio por enquanto: a rota de
-- turmas ainda não manda esse id, então o local é reconhecido por nome + cidade + UF. Quando o IAM Control passar a
-- mandar, a sincronização preenche a coluna sem outra migration.
-- Nenhuma linha é apagada e nome, tipo e endereço de nenhuma linha mudam aqui.
ALTER TABLE "eventos"."local" ADD COLUMN "origem" text DEFAULT 'EVENTOS' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."local" ADD COLUMN "iam_control_endereco_id" integer;--> statement-breakpoint
CREATE INDEX "local_iam_control_endereco_idx" ON "eventos"."local" USING btree ("iam_control_endereco_id") WHERE "eventos"."local"."iam_control_endereco_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."local" ADD CONSTRAINT "local_origem_check" CHECK ("eventos"."local"."origem" IN ('EVENTOS', 'IAM_CONTROL'));--> statement-breakpoint
ALTER TABLE "eventos"."local" ADD CONSTRAINT "local_iam_control_endereco_check" CHECK ("eventos"."local"."iam_control_endereco_id" IS NULL OR "eventos"."local"."origem" = 'IAM_CONTROL');
--> statement-breakpoint
-- DADOS: o local de um evento que veio de turma do IAM Control foi posto ali pela sincronização (que já criava o
-- local com o nome e o endereço da turma, ou reaproveitava o cadastro de mesmo nome). Esses passam a IAM_CONTROL.
-- Apartamento da IAM não é local do IAM Control. Os demais (hotéis e apartamentos cadastrados à mão, hotéis informados
-- pela SDC, locais de evento que nenhuma turma usa) continuam EVENTOS; a próxima sincronização liga os que tiverem o
-- mesmo nome + cidade + UF de um local do IAM Control. atualizado_em não muda: nada do que a tela edita mudou.
UPDATE eventos.local l
   SET origem = 'IAM_CONTROL'
 WHERE l.tipo IN ('EVENTO', 'HOTEL')
   AND EXISTS (SELECT 1 FROM eventos.evento e WHERE e.local_id = l.id AND e.iam_control_turma_id IS NOT NULL);
-- Privilégios: nada a conceder. app_eventos_worker já tem SELECT, INSERT e UPDATE em eventos.local inteira (0009), o que
-- vale para as colunas novas. app_eventos tem UPDATE só por coluna (0005) e NÃO ganha origem nem
-- iam_control_endereco_id: pelo app, a origem de um local não muda; quem liga um cadastro ao IAM Control é a sincronização.
