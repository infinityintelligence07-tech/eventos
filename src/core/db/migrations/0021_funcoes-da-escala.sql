-- Funções da escala (Vitor, 26/11/2026).
--   Saem (apagadas): Palco, Pai / mãe, Som, Musicista, Logística, Aplicativo, Filmmaker e Trainee de líder.
--   "Líder" passa a se chamar "Líder de Confronto" (o código LIDER não muda: escalas, regras e cadastros continuam valendo).
--   Entram: Trainee de líder de evento e Trainee de líder de confronto.
-- Só dados; a estrutura não muda. Compatível com o código anterior: ele lê as funções pela tabela.

-- 1. Nenhuma escala pode ficar sem função: escala.funcao_id é ON DELETE SET NULL, então apagar a função com linha de
--    escala deixaria a linha órfã. Se existir alguma, a migration para sem mudar nada.
DO $$
DECLARE
  linhas integer;
BEGIN
  SELECT count(*) INTO linhas
    FROM eventos.escala es JOIN eventos.funcao f ON f.id = es.funcao_id
   WHERE f.codigo IN ('PALCO', 'PAI_MAE', 'SOM', 'MUSICISTA', 'LOGISTICA', 'APLICATIVO', 'FILMMAKER', 'TRAINEE_LIDER');
  IF linhas > 0 THEN
    RAISE EXCEPTION 'Há % linha(s) de escala com função que seria apagada (Palco, Pai / mãe, Som, Musicista, Logística, Aplicativo, Filmmaker ou Trainee de líder). Troque a função dessas linhas ou remova-as antes de aplicar.', linhas;
  END IF;
END $$;--> statement-breakpoint

-- 2. As regras de vagas deixam de citar as funções que saem (o Confronto tinha "1 Pai / mãe a cada 15 da fila").
UPDATE eventos.tipo_evento t
   SET regra_vagas = jsonb_set(
         t.regra_vagas,
         '{funcoes}',
         coalesce(
           (SELECT jsonb_agg(linha ORDER BY posicao)
              FROM jsonb_array_elements(t.regra_vagas -> 'funcoes') WITH ORDINALITY AS item(linha, posicao)
             WHERE linha ->> 'funcao' NOT IN ('PALCO', 'PAI_MAE', 'SOM', 'MUSICISTA', 'LOGISTICA', 'APLICATIVO', 'FILMMAKER', 'TRAINEE_LIDER')),
           '[]'::jsonb)),
       atualizado_em = now()
 WHERE jsonb_typeof(t.regra_vagas -> 'funcoes') = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.regra_vagas -> 'funcoes') linha
                WHERE linha ->> 'funcao' IN ('PALCO', 'PAI_MAE', 'SOM', 'MUSICISTA', 'LOGISTICA', 'APLICATIVO', 'FILMMAKER', 'TRAINEE_LIDER'));--> statement-breakpoint

-- 3. Apaga as funções. A habilitação das pessoas nessas funções (pessoa_funcao) vai junto, por ON DELETE CASCADE.
DELETE FROM eventos.funcao
 WHERE codigo IN ('PALCO', 'PAI_MAE', 'SOM', 'MUSICISTA', 'LOGISTICA', 'APLICATIVO', 'FILMMAKER', 'TRAINEE_LIDER');--> statement-breakpoint

-- 4. Líder -> Líder de Confronto.
UPDATE eventos.funcao SET nome = 'Líder de Confronto' WHERE codigo = 'LIDER';--> statement-breakpoint

-- 5. Os dois trainees novos (funções do cadastro, como as demais).
INSERT INTO eventos.funcao (codigo, nome) VALUES
  ('TRAINEE_LIDER_EVENTO', 'Trainee de líder de evento'),
  ('TRAINEE_LIDER_CONFRONTO', 'Trainee de líder de confronto')
ON CONFLICT (codigo) DO NOTHING;
