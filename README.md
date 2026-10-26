# Eventos

Sistema do time de eventos da IAM: escala de eventos e Masterclass, comunicação com o staff,
logística (carona, voo, hotel) e custos. Fase atual: backend e banco.

- Banco: Supabase `iam-pessoas` (sa-east-1), compartilhado com o GH (repo GH-System).
  Este repo só cria migrations do schema `eventos`; `core` e `sensivel` são lidos (ver `src/core/db/schema/core.ts`).
- Decisões: [docs/adr/0001-banco-pessoas-gh-eventos.md](docs/adr/0001-banco-pessoas-gh-eventos.md)
- Requisitos: [docs/01-requisitos-e-viabilidade.md](docs/01-requisitos-e-viabilidade.md)
- Regras de custo: [docs/03-regras-de-custo.md](docs/03-regras-de-custo.md)

## Rodar

```bash
npm ci
cp .env.example .env          # DATABASE_URL (o usuário cola; nunca commitar)
npm run dev                   # web em http://localhost:3000 (GET /api/health, /api/health?db=1)
npm run worker                # fila pg-boss no schema pgboss_eventos
npm run sync:turmas           # sincroniza as turmas do IAM Control uma vez (-- --a-partir-de=AAAA-MM-DD)
npm run lint && npm run typecheck && npm test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm test   # inclui integração
```

## Estrutura

```
src/
  app/                 Next.js (rotas). Interface ainda não aprovada: só API por enquanto.
  core/                infraestrutura: config (env validado com Zod), db, logging (pino), jobs (pg-boss)
  modules/<nome>/
    domain/            regras puras, sem banco, sem relógio, sem ambiente (o lint barra)
    index.ts           interface pública do módulo
  jobs/                junta módulos e infraestrutura (sincronização de turmas)
  worker.ts            processo do pg-boss
```

## Turmas do IAM Control → eventos → vagas

O worker roda `sincronizar-turmas` a cada 30 min (6h–23h, Brasília):

1. Lê `GET /api/webhooks/eventos/turmas` do IAM Control (módulo `integracao-eventos` do
   IAM-Control-Backend, token exclusivo `EVENTOS_WEBHOOK_TOKENS` lá = `IAM_CONTROL_EVENTOS_TOKEN` aqui).
2. Converte cada turma (`modules/eventos/domain/turma.ts`): tipo pelo treinamento (IPR vira ASM a partir
   da edição 230), código `SIGLA_POLO_EDIÇÃO`, datas em Brasília, status, público e local.
3. Cria ou atualiza o evento pela `iam_control_turma_id`. O IAM Control manda em datas, edição, polo,
   local e cancelamento. Expectativa de público só é preenchida se estiver vazia; pessoas na fila é do time.
   Evento apagado no Eventos não volta. Código já usado por outro evento fica em branco e é avisado.
4. Gera as vagas da regra do tipo (`modules/escala`): linhas `origem = REGRA`, das 08:00 às 18:00 no primeiro
   dia, escala em `RASCUNHO`, sem pessoas. Linhas `MANUAL` não são tocadas; vaga com convocação não é
   removida; escala `APROVADA`/`COMUNICADA` e evento cancelado/concluído não são recalculados.

O resumo (criados, atualizados, ignoradas e por quê, conflitos, avisos) vai para o log.

Regras puras já prontas, com testes:

| Módulo | Regra |
|---|---|
| `escala` | Vagas por tipo de evento a partir de `tipo_evento.regra_vagas` (Confronto, ASM). Fórmulas editáveis, avaliadas sem `eval`; dado faltando vira pendência, não 0. |
| `comunicacao` | Motor de copy: `{{evento.cidade}}`, `{{genero:ESCALADO\|ESCALADA}}`, lista do que falta, hash dos dados para marcar copy desatualizada, saudação e período em português. |
| `eventos` | Código `SIGLA_POLO_EDIÇÃO`: montar, separar e normalizar o que foi digitado nas planilhas. |

Os testes leem os tipos de evento e os modelos de copy direto da migration `0002`, então um dado inicial inválido quebra o CI.

Testes de integração (`*.integracao.test.ts`) rodam com `TEST_DATABASE_URL`: criam um banco descartável com a
estrutura do GH (`src/test/fixtures/gh-schema.sql`, gerada por `pg_dump --schema-only` das migrations do GH-System)
e aplicam as migrations do Eventos por cima. Regere a fixture quando o GH mudar `core` ou as tabelas de evento.

## Deploy (EasyPanel)

Um `Dockerfile`, duas imagens:

```bash
docker build --target web    -t eventos-web .     # Next standalone, porta 3000, healthcheck /api/health
docker build --target worker -t eventos-worker .  # pg-boss
```

Variáveis: `DATABASE_URL`, `WORKER_DATABASE_URL` (opcional, conexão direta para o worker),
`IAM_CONTROL_URL`, `IAM_CONTROL_EVENTOS_TOKEN` (worker), `LOG_LEVEL`.

## Banco

```bash
npm run db:migrate            # aplica as migrations do schema eventos
npm run db:generate           # gera migration a partir de src/core/db/schema/eventos
```

- Localmente, aplique antes as migrations do GH-System (criam `core`, `sensivel` e as tabelas de evento adotadas).
- O histórico de migrations deste repo fica em `drizzle.__drizzle_migrations_eventos`.
- Toda migration manual tem `.down.sql`. Valores de dinheiro sempre em centavos.
