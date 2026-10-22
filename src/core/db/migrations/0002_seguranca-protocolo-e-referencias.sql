-- 1. Segurança: RLS em todas as tabelas do schema eventos, sem políticas.
-- Os apps acessam pelo servidor; anon/authenticated (API do Supabase) não têm acesso.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'eventos' LOOP
    EXECUTE format('ALTER TABLE eventos.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA eventos FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA eventos FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eventos FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA eventos REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
--> statement-breakpoint
-- 2. Protocolo STF-AAAAMM-NNNN com numeração sem repetição por mês (horário de Brasília).
CREATE OR REPLACE FUNCTION eventos.proximo_protocolo()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  ano_mes text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM');
  numero integer;
BEGIN
  INSERT INTO eventos.protocolo_sequencia (ano_mes, ultimo)
  VALUES (ano_mes, 1)
  ON CONFLICT ON CONSTRAINT protocolo_sequencia_pkey
  DO UPDATE SET ultimo = eventos.protocolo_sequencia.ultimo + 1
  RETURNING ultimo INTO numero;

  RETURN 'STF-' || ano_mes || '-' || lpad(numero::text, 4, '0');
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION eventos.proximo_protocolo() FROM PUBLIC;
--> statement-breakpoint
-- 3. Tipos de evento. Regras de vagas do Confronto e do ASM (docs/01-requisitos-e-viabilidade.md).
-- IPR e ASM: a numeração do IPR continua no ASM em 2026; a confirmar se são o mesmo tipo.
INSERT INTO eventos.tipo_evento (sigla, nome, dias, regra_vagas) VALUES
  ('IPR', 'Imersão Prosperar', 3, '{}'),
  ('ASM', 'ASM', 3, '{"funcoes": [
      {"funcao": "STAFF_LIDER", "formula": "ceil(expectativa_publico * 0.5 / 25)"},
      {"funcao": "STAFF", "formula": "2 * STAFF_LIDER"},
      {"funcao": "DJ", "fixo": 1},
      {"funcao": "SOCIAL_MEDIA", "fixo": 1},
      {"funcao": "FOTOGRAFO", "fixo": 1},
      {"funcao": "CAMARIM", "fixo": 1}]}'),
  ('CONF', 'Confronto', 4, '{"funcoes": [
      {"funcao": "LIDER", "formula": "ceil(expectativa_publico / 25)"},
      {"funcao": "PAI_MAE", "formula": "ceil(pessoas_na_fila / 15)"},
      {"funcao": "DJ", "fixo": 1},
      {"funcao": "SOCIAL_MEDIA", "fixo": 1},
      {"funcao": "FOTOGRAFO", "fixo": 1},
      {"funcao": "CAMARIM", "fixo": 1}]}'),
  ('MG', 'Missão Governar', 4, '{}'),
  ('LIB', 'Liberty', 2, '{}'),
  ('LEGACY', 'Legacy XP', 1, '{}'),
  ('MC', 'Masterclass', NULL, '{}'),
  ('IMERSAO_NEGOCIOS', 'Imersão de Negócios', 2, '{}'),
  ('TRAINER', 'Trainer', 3, '{}'),
  ('LIFE_COACH', 'Life Coach', 3, '{}'),
  ('PNL_PMR', 'PNL | PMR', 3, '{}'),
  ('MESA_DESTINO', 'Mesa de Destino', 1, '{}');
--> statement-breakpoint
-- 4. Funções exercidas nos eventos (planilhas BD 2026 e BD Time Eventos).
INSERT INTO eventos.funcao (codigo, nome) VALUES
  ('STAFF_LIDER', 'Staff líder'),
  ('STAFF', 'Staff'),
  ('LIDER', 'Líder'),
  ('LIDER_EVENTO', 'Líder do evento'),
  ('PAI_MAE', 'Pai / mãe'),
  ('PALCO', 'Palco'),
  ('DJ', 'DJ'),
  ('SOCIAL_MEDIA', 'Social media'),
  ('FOTOGRAFO', 'Fotógrafo'),
  ('FILMMAKER', 'Filmmaker'),
  ('CAMARIM', 'Staff camarim'),
  ('TUTOR', 'Tutor'),
  ('COORDENACAO', 'Coordenação'),
  ('PERSONAGEM', 'Personagem'),
  ('MUSICISTA', 'Musicista'),
  ('CUIDADO_ALUNO', 'Cuidado de aluno'),
  ('APLICATIVO', 'Aplicativo'),
  ('SOM', 'Som'),
  ('PALESTRANTE', 'Palestrante');
--> statement-breakpoint
-- 5. Regras de custo iniciais: aba REGRA DE CUSTO da planilha de solicitação de custo (lida em 22/10/2026).
-- Editáveis depois pela aba Configurações › Regras de custo. Valores em centavos.
INSERT INTO eventos.regra_custo (categoria, codigo, nome, tipo_evento_id, unidade, valor_centavos, observacao)
SELECT v.categoria, v.codigo, v.nome, t.id, v.unidade, v.valor, v.obs
FROM (VALUES
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'IPR', 'EVENTO', 60000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'IPR', 'EVENTO', 27000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'ASM', 'EVENTO', 60000, 'Copiado de Imersão Prosperar; a planilha não tem linha ASM.'),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'ASM', 'EVENTO', 27000, 'Copiado de Imersão Prosperar; a planilha não tem linha ASM.'),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'LEGACY', 'EVENTO', 20000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'LEGACY', 'EVENTO', 8000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'MG', 'EVENTO', 80000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'MG', 'EVENTO', 36000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'LIB', 'EVENTO', 40000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'LIB', 'EVENTO', 18000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'CONF', 'EVENTO', 80000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'CONF', 'EVENTO', 36000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração por hora', 'MC', 'HORA', 7000, 'Planilha: "HORAS"; alimentação vazia.'),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'IMERSAO_NEGOCIOS', 'EVENTO', 40000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'IMERSAO_NEGOCIOS', 'EVENTO', 18000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'TRAINER', 'EVENTO', 60000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'TRAINER', 'EVENTO', 27000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'LIFE_COACH', 'EVENTO', 60000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'LIFE_COACH', 'EVENTO', 27000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'PNL_PMR', 'EVENTO', 60000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'PNL_PMR', 'EVENTO', 27000, NULL),
  ('REMUNERACAO', 'REMUNERACAO', 'Remuneração', 'MESA_DESTINO', 'EVENTO', 20000, NULL),
  ('ALIMENTACAO', 'ALIMENTACAO', 'Alimentação', 'MESA_DESTINO', 'EVENTO', 5000, NULL)
) AS v(categoria, codigo, nome, sigla, unidade, valor, obs)
JOIN eventos.tipo_evento t ON t.sigla = v.sigla;
--> statement-breakpoint
INSERT INTO eventos.regra_custo (categoria, codigo, nome, unidade, valor_centavos, parametros, observacao) VALUES
  ('DEPRECIACAO', 'FAIXA_ATE_99', 'Depreciação abaixo de 100 km', 'DESLOCAMENTO', 0, '{"km_min": 0, "km_max": 99.99}', 'Cada deslocamento conta separado.'),
  ('DEPRECIACAO', 'FAIXA_100_249', 'Depreciação de 100 a 249 km', 'DESLOCAMENTO', 8000, '{"km_min": 100, "km_max": 249.99}', 'Cada deslocamento conta separado.'),
  ('DEPRECIACAO', 'FAIXA_250', 'Depreciação a partir de 250 km', 'DESLOCAMENTO', 25000, '{"km_min": 250}', 'Cada deslocamento conta separado.'),
  ('ADICIONAL', 'HOSPEDAGEM_AP_IAM', 'Hospedagem no AP IAM', 'FIXO', 1000, '{}', 'A confirmar: teto, valor fixo ou por dia.'),
  ('ADICIONAL', 'ESTACIONAMENTO', 'Estacionamento', 'FIXO', 2500, '{}', 'A confirmar: teto, valor fixo ou por dia.'),
  ('ADICIONAL', 'VIAGEM_3H', 'Viagem com duração de 3h', 'FIXO', 2000, '{"duracao_min_h": 3}', 'A confirmar: teto, valor fixo ou por dia.'),
  ('ADICIONAL', 'FOTOGRAFO_FIXO', 'Fotógrafo (valor fixo)', 'EVENTO', 250000, '{}', NULL),
  ('ADICIONAL', 'DJ_FIXO', 'DJ (valor fixo)', 'EVENTO', 450000, '{}', 'Na planilha está como valor de um DJ específico.'),
  ('MONTAGEM', 'ATE_100_ALUNOS', 'Montagem até 100 alunos (início 14h, 5h)', 'EVENTO', 1000, '{"alunos_max": 100, "inicio": "14:00", "horas": 5}', 'A confirmar o significado do valor; faixas 101-149 e 251-299 sem regra.'),
  ('MONTAGEM', 'DE_150_A_250_ALUNOS', 'Montagem de 150 a 250 alunos (início 13h, 6h)', 'EVENTO', 4000, '{"alunos_min": 150, "alunos_max": 250, "inicio": "13:00", "horas": 6}', 'A confirmar o significado do valor.'),
  ('MONTAGEM', 'A_PARTIR_300_ALUNOS', 'Montagem a partir de 300 alunos (início 9h, 8h)', 'EVENTO', 8000, '{"alunos_min": 300, "inicio": "09:00", "horas": 8}', 'A confirmar o significado do valor.'),
  ('LIMITE', 'CONSUMO_CRITICO', 'Exceção crítica de consumo', 'NENHUMA', NULL, '{"km_l_min": 7.5, "km_l_max": 22, "custo_km_max_centavos": 95}', 'Vai para análise do financeiro.'),
  ('LIMITE', 'CONSUMO_ALERTA', 'Alerta de consumo', 'NENHUMA', NULL, '{"km_l_min": 10, "custo_km_max_centavos": 70}', 'Vai para análise do financeiro.');
--> statement-breakpoint
-- 6. Modelos de copy enviados pelo time de eventos (21/10/2026), com variáveis.
INSERT INTO eventos.modelo_copy (tipo, nome, corpo) VALUES
  ('ESCALACAO', 'Escalação', 'Uaaaau que top você está ESCALADO(A)

Estamos muito felizes por contar com você nesta {{evento.tipo}}! ❤️‍🔥
Você estará com a gente nessa missão!

📍 {{evento.cidade}}
📅 {{evento.data}}
🕐 {{evento.horario}}

E para deixar tudo organizado para você servir com tranquilidade, solicite os custos da sua participação pelo link abaixo:

⚠️ATENÇÃO: todos os custos de deslocamento, alimentação e reembolsos serão pagos através do cartão CAJU.

👉 {{link_custos}}
Preencha todas as informações solicitadas e, em breve, te passamos os próximos detalhes da sua escala. 🚀'),
  ('HOSPEDAGEM', 'Hospedagem', '{{saudacao}}! Tudo bem? 🤩

Confira as informações da sua participação no {{evento.codigo}}:

📍 CIDADE: {{evento.cidade}} - {{local.nome}}
📅 DATA: {{evento.data}}
🕐 HORÁRIO: {{evento.horario}}
🎯 FUNÇÃO: {{pessoa.funcao}}

🚗 Deslocamento: {{pessoa.deslocamento}}

🏨 Hospedagem: {{hospedagem.hotel}}
📍 Endereço: {{hospedagem.endereco}}
🛏️ Colega de quarto: {{hospedagem.colega}}

❤️‍🔥 Qualquer dúvida ou se alguma informação estiver diferente, me avise.');
