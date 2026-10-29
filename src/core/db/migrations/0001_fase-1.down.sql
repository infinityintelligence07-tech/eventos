DROP TABLE IF EXISTS "eventos"."custo_item", "eventos"."deslocamento", "eventos"."rota_cache",
  "eventos"."solicitacao_custo", "eventos"."protocolo_sequencia", "eventos"."regra_custo",
  "eventos"."mensagem", "eventos"."modelo_copy", "eventos"."disponibilidade", "eventos"."enquete_evento",
  "eventos"."enquete", "eventos"."pessoa_veiculo", "eventos"."pessoa_funcao", "eventos"."pessoa_evento" CASCADE;
ALTER TABLE "eventos"."convocacao"
  DROP COLUMN IF EXISTS "convidada_em", DROP COLUMN IF EXISTS "motivo_recusa", DROP COLUMN IF EXISTS "deslocamento",
  DROP COLUMN IF EXISTS "carona_id", DROP COLUMN IF EXISTS "distancia_km", DROP COLUMN IF EXISTS "tempo_trajeto_min",
  DROP COLUMN IF EXISTS "montagem", DROP COLUMN IF EXISTS "observacao", DROP COLUMN IF EXISTS "sugestao_score",
  DROP COLUMN IF EXISTS "criado_por";
DROP TABLE IF EXISTS "eventos"."carona" CASCADE;
ALTER TABLE "eventos"."escala" DROP COLUMN IF EXISTS "funcao_id", DROP COLUMN IF EXISTS "origem";
ALTER TABLE "eventos"."evento"
  DROP CONSTRAINT IF EXISTS "evento_status_escala_check", DROP CONSTRAINT IF EXISTS "evento_aprovacao_check",
  DROP CONSTRAINT IF EXISTS "evento_publico_check",
  DROP COLUMN IF EXISTS "tipo_evento_id", DROP COLUMN IF EXISTS "codigo", DROP COLUMN IF EXISTS "edicao",
  DROP COLUMN IF EXISTS "iam_control_turma_id", DROP COLUMN IF EXISTS "local_id", DROP COLUMN IF EXISTS "expectativa_publico",
  DROP COLUMN IF EXISTS "pessoas_na_fila", DROP COLUMN IF EXISTS "status_escala", DROP COLUMN IF EXISTS "aprovado_por",
  DROP COLUMN IF EXISTS "aprovado_em", DROP COLUMN IF EXISTS "sincronizado_em";
DROP TABLE IF EXISTS "eventos"."funcao", "eventos"."local", "eventos"."tipo_evento" CASCADE;
