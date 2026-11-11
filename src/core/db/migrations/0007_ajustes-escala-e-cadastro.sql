ALTER TABLE "eventos"."convocacao" DROP CONSTRAINT "convocacao_deslocamento_check";--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" DROP CONSTRAINT "pessoa_evento_camiseta_tamanho_check";--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD COLUMN "check_in" date;--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD COLUMN "check_out" date;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_deslocamento_check" CHECK ("eventos"."convocacao"."deslocamento" IS NULL OR "eventos"."convocacao"."deslocamento" IN ('CARRO_PROPRIO', 'CARONA', 'CARRO_IAM', 'UBER', 'ONIBUS', 'VOO', 'MOTO', 'A_PE', 'NAO_SE_APLICA'));--> statement-breakpoint
ALTER TABLE "eventos"."quarto_ocupante" ADD CONSTRAINT "quarto_ocupante_periodo_check" CHECK (("eventos"."quarto_ocupante"."check_in" IS NULL) = ("eventos"."quarto_ocupante"."check_out" IS NULL) AND ("eventos"."quarto_ocupante"."check_in" IS NULL OR "eventos"."quarto_ocupante"."check_out" > "eventos"."quarto_ocupante"."check_in"));--> statement-breakpoint
ALTER TABLE "eventos"."pessoa_evento" ADD CONSTRAINT "pessoa_evento_camiseta_tamanho_check" CHECK ("eventos"."pessoa_evento"."camiseta_tamanho" IS NULL OR "eventos"."pessoa_evento"."camiseta_tamanho" IN ('PP', 'P', 'M', 'G', 'GG', 'XG', 'G1'));--> statement-breakpoint
-- Funções que aparecem na planilha BD Time Eventos e faltavam no cadastro (lida em 10/11/2026).
INSERT INTO eventos.funcao (codigo, nome) VALUES
  ('LIDER_MC', 'Líder de Masterclass'),
  ('LOGISTICA', 'Logística'),
  ('TRAINER', 'Trainer'),
  ('MASTER_TRAINER', 'Master trainer')
ON CONFLICT (codigo) DO NOTHING;
