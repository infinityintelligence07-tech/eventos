DELETE FROM eventos.modelo_copy;
DELETE FROM eventos.regra_custo;
DELETE FROM eventos.funcao;
DELETE FROM eventos.tipo_evento;
DROP FUNCTION IF EXISTS eventos.proximo_protocolo();
