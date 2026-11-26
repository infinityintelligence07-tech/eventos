-- Copy de reprovação de custo (Vitor, 26/11/2026): ao reprovar uma solicitação, o time recebe a mensagem pronta, com o
-- motivo, para mandar à pessoa. O texto é um modelo editável em Configurações › Modelos de copy, de um tipo novo.
-- Compatível com o código anterior: ele só lê modelos pelos quatro tipos da escala.
ALTER TABLE "eventos"."modelo_copy" DROP CONSTRAINT "modelo_copy_tipo_check";--> statement-breakpoint
ALTER TABLE "eventos"."modelo_copy" ADD CONSTRAINT "modelo_copy_tipo_check" CHECK ("eventos"."modelo_copy"."tipo" IN ('ESCALACAO', 'HOSPEDAGEM', 'LEMBRETE', 'ALTERACAO', 'REPROVACAO_CUSTO'));--> statement-breakpoint
INSERT INTO eventos.modelo_copy (tipo, nome, corpo, ativo)
SELECT 'REPROVACAO_CUSTO', 'Reprovação de custo',
       E'{{saudacao}}, {{pessoa.primeiro_nome}}!\n\nSua solicitação de custo do evento {{evento.codigo}} não foi aprovada.\n\nProtocolo: {{custo.protocolo}}\nMotivo: {{custo.motivo}}\n\nCorrija e envie de novo pelo formulário de custos. Qualquer dúvida, fale com o time de eventos.',
       true
 WHERE NOT EXISTS (SELECT 1 FROM eventos.modelo_copy WHERE tipo = 'REPROVACAO_CUSTO');
