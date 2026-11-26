-- Desfaz a 0021: devolve as funções apagadas (sem as habilitações das pessoas, que não dá para reconstruir), o nome
-- "Líder" e a linha de Pai / mãe na regra do Confronto (na segunda posição, onde estava), e tira os dois trainees novos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM eventos.escala es JOIN eventos.funcao f ON f.id = es.funcao_id
              WHERE f.codigo IN ('TRAINEE_LIDER_EVENTO', 'TRAINEE_LIDER_CONFRONTO')) THEN
    RAISE EXCEPTION 'Há linha de escala com Trainee de líder de evento ou de confronto. Troque a função dessas linhas antes de desfazer.';
  END IF;
END $$;

DELETE FROM eventos.funcao WHERE codigo IN ('TRAINEE_LIDER_EVENTO', 'TRAINEE_LIDER_CONFRONTO');

UPDATE eventos.funcao SET nome = 'Líder' WHERE codigo = 'LIDER';

INSERT INTO eventos.funcao (codigo, nome, cargo_do_evento) VALUES
  ('PALCO', 'Palco', false),
  ('PAI_MAE', 'Pai / mãe', true),
  ('SOM', 'Som', false),
  ('MUSICISTA', 'Musicista', false),
  ('LOGISTICA', 'Logística', false),
  ('APLICATIVO', 'Aplicativo', false),
  ('FILMMAKER', 'Filmmaker', false),
  ('TRAINEE_LIDER', 'Trainee de líder', false)
ON CONFLICT (codigo) DO NOTHING;

UPDATE eventos.tipo_evento t
   SET regra_vagas = jsonb_insert(t.regra_vagas, '{funcoes,1}', '{"funcao": "PAI_MAE", "formula": "ceil(pessoas_na_fila / 15)"}'::jsonb),
       atualizado_em = now()
 WHERE t.sigla = 'CONF'
   AND jsonb_typeof(t.regra_vagas -> 'funcoes') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.regra_vagas -> 'funcoes') linha WHERE linha ->> 'funcao' = 'PAI_MAE');
