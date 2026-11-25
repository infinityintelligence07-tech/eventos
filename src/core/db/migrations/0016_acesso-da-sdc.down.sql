-- Desfaz a 0016. O histórico é só de inclusão e passa a citar a SDC: se alguém da SDC já gravou alguma ação, o down
-- para com uma mensagem clara em vez de apagar a autoria. Aprovações de pagamento e a lista de e-mails se perdem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM eventos.registro_acao WHERE origem = 'SDC') THEN
    RAISE EXCEPTION 'down da 0016: o histórico já tem ações da SDC (origem SDC). Voltar apagaria quem fez; não desfaça por aqui.';
  END IF;
END $$;

ALTER TABLE "eventos"."registro_acao" DROP CONSTRAINT IF EXISTS "registro_acao_autoria_check";
ALTER TABLE "eventos"."registro_acao" DROP CONSTRAINT IF EXISTS "registro_acao_origem_check";
DROP INDEX IF EXISTS "eventos"."registro_acao_acesso_sdc_idx";
ALTER TABLE "eventos"."registro_acao" DROP COLUMN IF EXISTS "acesso_sdc_id";
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_origem_check" CHECK ("origem" IN ('USUARIO', 'SISTEMA'));
ALTER TABLE "eventos"."registro_acao" ADD CONSTRAINT "registro_acao_autoria_check" CHECK (("origem" = 'USUARIO') = ("usuario_id" IS NOT NULL));

ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_retorno_autor_check";
ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_aprovacao_obs_check";
ALTER TABLE "eventos"."pedido_sdc" DROP CONSTRAINT IF EXISTS "pedido_sdc_aprovacao_check";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "observacao_aprovacao";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "aprovado_por";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "aprovado_em";
ALTER TABLE "eventos"."pedido_sdc" DROP COLUMN IF EXISTS "retorno_registrado_pela_sdc";

DROP TABLE IF EXISTS eventos.acesso_sdc;
