-- Mudanças da escala pedidas pelo time (nov/2026). Roda sobre os dados que já existem: primeiro a estrutura,
-- depois os dados, e por último o CHECK novo do deslocamento (que só passa depois de limpar os valores antigos).
ALTER TABLE "eventos"."convocacao" DROP CONSTRAINT "convocacao_deslocamento_check";--> statement-breakpoint
ALTER TABLE "eventos"."funcao" ADD COLUMN "cargo_do_evento" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos"."convocacao" ADD COLUMN "precisa_hotel" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 1. Hospedagem marcada na escala: ao pôr a pessoa na escala, o time diz se ela vai precisar de hotel, e a Hospedagem
--    só aloca em quarto quem está marcado. Quem já ocupa um quarto entra marcado, para não sumir do rooming.
UPDATE eventos.convocacao c SET precisa_hotel = true
 WHERE EXISTS (SELECT 1 FROM eventos.quarto_ocupante qo WHERE qo.convocacao_id = c.id);--> statement-breakpoint

-- 2. Deslocamento: saem Moto, A pé e Não se aplica. Quem estava com um deles volta para "Não definido".
UPDATE eventos.convocacao SET deslocamento = NULL, atualizado_em = now()
 WHERE deslocamento IN ('MOTO', 'A_PE', 'NAO_SE_APLICA');--> statement-breakpoint

-- 3. Situação da pessoa na escala: a tela não pede mais; quem está na escala conta como confirmado. As convocações
--    que só estavam na escala (SUGERIDA) ou aguardando resposta (CONVIDADA) viram ACEITA. RECUSADA e CANCELADA ficam
--    como estão, e o CHECK de status não muda (o GH e o histórico usam os cinco valores). O status anterior vai para o
--    histórico, que é o que o .down.sql usa para voltar. convidada_em não muda: continua dizendo quem já foi avisada.
INSERT INTO eventos.registro_acao (entidade, entidade_id, evento_id, acao, status_de, status_para, origem, dados)
SELECT 'CONVOCACAO', c.id, e.evento_id, 'CONFIRMADA_PELA_MIGRACAO', c.status, 'ACEITA', 'SISTEMA', '{"migration": "0013"}'::jsonb
  FROM eventos.convocacao c
  JOIN eventos.escala e ON e.id = c.escala_id
 WHERE c.status IN ('SUGERIDA', 'CONVIDADA');--> statement-breakpoint
UPDATE eventos.convocacao SET status = 'ACEITA', atualizado_em = now()
 WHERE status IN ('SUGERIDA', 'CONVIDADA');--> statement-breakpoint

-- 4. Pai / mãe deixa de ser habilitação da pessoa: é um cargo da escala do Confronto que qualquer staff pode ocupar.
--    A função continua no cadastro (a regra de vagas do Confronto e as escalas existentes usam), agora marcada como
--    cargo do evento. As habilitações de Pai / mãe que as pessoas tinham saem; ficam no histórico (para o .down.sql).
UPDATE eventos.funcao SET cargo_do_evento = true WHERE codigo = 'PAI_MAE';--> statement-breakpoint
INSERT INTO eventos.registro_acao (entidade, entidade_id, acao, origem, dados)
SELECT 'PESSOA', pf.pessoa_id, 'FUNCAO_RETIRADA', 'SISTEMA', jsonb_build_object('migration', '0013', 'funcao', f.codigo, 'nivel', pf.nivel)
  FROM eventos.pessoa_funcao pf
  JOIN eventos.funcao f ON f.id = pf.funcao_id
 WHERE f.cargo_do_evento;--> statement-breakpoint
DELETE FROM eventos.pessoa_funcao pf USING eventos.funcao f
 WHERE f.id = pf.funcao_id AND f.cargo_do_evento;--> statement-breakpoint

-- 5. Função nova: Trainee de líder (sem regra de custo própria e fora das regras de vagas).
INSERT INTO eventos.funcao (codigo, nome) VALUES ('TRAINEE_LIDER', 'Trainee de líder')
ON CONFLICT (codigo) DO NOTHING;--> statement-breakpoint

ALTER TABLE "eventos"."convocacao" ADD CONSTRAINT "convocacao_deslocamento_check" CHECK ("eventos"."convocacao"."deslocamento" IS NULL OR "eventos"."convocacao"."deslocamento" IN ('CARRO_PROPRIO', 'CARONA', 'CARRO_IAM', 'UBER', 'ONIBUS', 'VOO'));
