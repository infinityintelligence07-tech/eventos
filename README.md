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
TEST_DATABASE_URL=local npm test   # inclui integração, no Postgres do banco:local (senha lida de .banco-local/)
```

## Desenvolvimento local (banco de teste)

```bash
npm run banco:local           # recria do zero o banco eventos_local (Postgres 15 em .banco-local/, 127.0.0.1:55432)
npm run dev:local             # next dev com esse banco (EVENTOS_MODO=local); outra porta: npm run dev:local -- -p 3001
```

- `banco:local` copia da produção, **só leitura** (transação `READ ONLY` conferida), polos, locais, eventos, escalas,
  tipos de evento, funções, regras de custo e modelos de copy (com os mesmos ids). Origem: **use
  `ORIGEM_DATABASE_URL` com o papel `app_eventos_copia`** (só `SELECT` nas tabelas copiadas). Sem ela, cai na
  `DATABASE_URL` do `.env` (compatibilidade) e avisa na saída que a origem não é o `app_eventos_copia`. Aplica todas as migrations do repositório (inclusive as que ainda não foram à produção),
  grava o marcador `eventos.ambiente = 'local'` no banco e semeia ~60 pessoas fictícias (`@exemplo.test`, telefones
  `90000-xxxx`, sem CPF/PIX) nos 8 polos, uma enquete aberta e um cenário por frente nos próximos ASM/Confronto com vagas:
  escala `APROVADA` (convocações em todos os status, copys enviadas e desatualizada, pedidos à SDC, hotel com quartos,
  solicitações de custo com e sem alerta), `AGUARDANDO_APROVACAO`, `DEVOLVIDA` (com comentário) e `RASCUNHO` com fila.
  `link_custos` fica em `https://exemplo.test/custos`.
- Postgres local com senha (scram-sha-256), escutando só em `127.0.0.1` e com socket em `.banco-local/socket`.
  As senhas (`postgres` e `app_eventos`) são geradas na criação do cluster e ficam em `.banco-local/credenciais.json`
  (0600, fora do Git); nenhum comando as exibe. Um cluster antigo sem senha é apagado e recriado no próximo `banco:local`.
- O app local conecta como **`app_eventos`** (papel da 0005, com os grants e as políticas de verdade). O banco também
  recebe a proposta de acesso do GH ao `core` (`docs/gh-proposta-papeis-do-eventos.sql`: perfis, grants e políticas).
- Usuários do "Entrar como" (ids fixos): Time A `7e570000-0000-7000-8000-000000000001` (`EVENTOS_TIME`),
  Time B `…0003` (`EVENTOS_TIME`; é também o staff da primeira solicitação de custo), Líder `…0005` (`EVENTOS_LIDER`)
  e Sem perfil `…0007`.
- `dev:local` sobe o Postgres local se estiver parado e sobrescreve `DATABASE_URL` sem tocar no `.env`.
  Postgres em outro caminho: `PG_BIN=/caminho/bin npm run banco:local`.

## Login (docs/09)

- **Produção:** só Google, pelo Supabase Auth do `iam-pessoas` (o mesmo do GH). Entra quem tem `core.usuario` ativo
  com o mesmo e-mail **e** perfil `EVENTOS_TIME` ou `EVENTOS_LIDER` (escopo `GLOBAL`) em `core.usuario_perfil`.
  Sem cadastro: a sessão é encerrada e o login mostra o aviso. Sem perfil: `/sem-acesso`.
- **Modo local (`dev:local`):** sem Google. Sem sessão vai para `/entrar-local` ("Entrar como"), que lista os usuários
  do banco local e só existe com as três travas do banco local abertas. "Sair" no cabeçalho.
- O `middleware.ts` só renova a sessão e manda para `/login`; quem decide o acesso é o layout do `(time)` e as actions.
- Variáveis (opcionais fora de produção, **obrigatórias em produção**): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave pública; o Eventos não usa `service_role`) e `EVENTOS_URL_PUBLICA`
  (endereço público do Eventos, usado no retorno do Google e no destino do callback; nunca o `Host` da requisição).
  No Supabase, `EVENTOS_URL_PUBLICA/auth/callback` precisa estar nas Redirect URLs.

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
e aplicam as migrations do Eventos e a proposta de acesso do GH por cima. Regere a fixture quando o GH mudar `core` ou
as tabelas de evento. `TEST_DATABASE_URL=local` usa o Postgres do `banco:local`; `BancoDeTeste.comoPapel` roda SQL como
`app_eventos`/`app_eventos_leitura`/`app_eventos_copia` (grants e RLS de verdade).

## Deploy (EasyPanel)

Um `Dockerfile`, duas imagens:

```bash
docker build --target web    -t eventos-web .     # Next standalone, porta 3000, healthcheck /api/health
docker build --target worker -t eventos-worker .  # pg-boss
```

Variáveis: `DATABASE_URL`, `WORKER_DATABASE_URL` (opcional, conexão direta para o worker),
`IAM_CONTROL_URL`, `IAM_CONTROL_EVENTOS_TOKEN` (worker), `LOG_LEVEL`; no web, também `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` e `EVENTOS_URL_PUBLICA` (ver "Login"). Nunca `EVENTOS_MODO` nem `SUPABASE_SERVICE_ROLE_KEY`.

## Banco

```bash
npm run db:migrate            # aplica as migrations do schema eventos
npm run db:generate           # gera migration a partir de src/core/db/schema/eventos
```

- **Trava:** `db:migrate` (e `drizzle-kit push/drop/up/studio`) recusa rodar quando o host da `DATABASE_URL` não é
  `localhost`/`127.0.0.1`/`[::1]`, antes de conectar. Para migrar um banco remoto de propósito:
  `EVENTOS_CONFIRMO_MIGRAR_REMOTO=sim npm run db:migrate`. A `0004_abas-do-time` ainda **não** vai para o `iam-pessoas`.
- Ordem para levar a 0004 à produção: (1) aplicar a 0004 (só acrescenta; também corrige a copy de escalação para
  `{{genero:ESCALADO|ESCALADA}}` e deixa um modelo ativo por tipo); (2) publicar o código; (3) só então incluir
  `{"funcao": "STAFF", "digitado": true}` na regra do Confronto (migration de dados à parte ou pela tela
  Configurações › Vagas). Com a regra antes do código, a sincronização antiga recusa a regra do Confronto.
- Localmente, aplique antes as migrations do GH-System (criam `core`, `sensivel` e as tabelas de evento adotadas).
- O histórico de migrations deste repo fica em `drizzle.__drizzle_migrations_eventos`.
- Toda migration manual tem `.down.sql`. Valores de dinheiro sempre em centavos.
- Papéis (`0005_papeis-do-app`, doc 09 §6): `app_eventos` (escrita mínima; `registro_acao` só `SELECT`/`INSERT`;
  `DELETE` só onde o código apaga), `app_eventos_leitura` (só `SELECT`, transação somente leitura) e `app_eventos_copia`
  (só as tabelas copiadas pelo `banco:local`). Nascem sem `LOGIN` e sem senha (ação manual no `iam-pessoas`).
  **Tabela nova em `eventos` precisa, na própria migration, do `GRANT` e das políticas** dos papéis (não há privilégio padrão).
- O acesso ao `core` é do GH: proposta em `docs/gh-proposta-papeis-do-eventos.sql`, aplicada depois da 0005.
  Em `core.pessoa` o app só vê quem tem `pessoa_evento`, quem tem perfil do Eventos ou quem já agiu no `registro_acao`;
  `evento`, `tipo_evento` e `local` têm `UPDATE` só nas colunas que as telas mudam, e o app não cria evento nem função.
