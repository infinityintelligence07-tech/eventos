-- Desfaz a 0014. Os arquivos no armazenamento (bucket) não são apagados por aqui: sem a tabela, ficam sem dono e
-- precisam ser removidos à mão.
DROP TABLE IF EXISTS eventos.comprovante_custo;

-- O histórico é só de inclusão: as linhas de COMPROVANTE_CUSTO já gravadas ficam. NOT VALID deixa o CHECK antigo
-- voltar sem conferir essas linhas; as novas voltam a ser recusadas.
ALTER TABLE "eventos"."registro_acao" DROP CONSTRAINT IF EXISTS "registro_acao_entidade_check",
  ADD CONSTRAINT "registro_acao_entidade_check" CHECK ("entidade" IN ('ESCALA_DO_EVENTO', 'CONVOCACAO', 'MENSAGEM', 'DISPONIBILIDADE', 'SOLICITACAO_CUSTO', 'PEDIDO_SDC', 'HOSPEDAGEM', 'CARONA', 'REGRA_CUSTO', 'MODELO_COPY', 'TIPO_EVENTO', 'CONFIGURACAO', 'PESSOA', 'LOCAL', 'ENQUETE', 'EVENTO', 'VAGA')) NOT VALID;
