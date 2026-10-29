-- Adoção (ADR 0001, regra 5): evento, escala, convocacao e presenca já existem no banco,
-- criadas pela migration 0000_base do GH-System. Esta migration só registra essas tabelas
-- no histórico do Eventos; não altera o banco.
SELECT 1;
