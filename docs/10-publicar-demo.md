# Publicar a demo — Easypanel + Cloudflare (v0.1, 29/10/2026)

Demo **somente leitura** em `https://eventos.iamcontrol.com.br`, apontada para o Supabase `iam-pessoas`, **sem login
no app** (`EVENTOS_MODO=demo`): todos entram como "Visitante (demo)", com a visão da líder. A porta é o **Cloudflare
Access** (lista de e-mails) e é obrigatório: sem ele, qualquer pessoa com o link vê os dados.

Nada grava, por três motivos independentes: a guarda de escrita fecha na demo (e recusa `EVENTOS_ESCRITA=producao`
junto), o ator `DEMO` não passa na trava 4 em nenhum modo, e o papel `app_eventos_leitura` é somente leitura no banco.
O login com Google (passos 2 e 3) fica para quando a demo virar a P3 de verdade: basta tirar `EVENTOS_MODO=demo`.

O que a demo mostra hoje: os 850 eventos, os 8 polos e as vagas geradas pela sincronização. `core.pessoa` está vazia
no `iam-pessoas`, então Pessoas, Escalas com nomes, Comunicação e Custos aparecem vazios até o GH cadastrar o staff.

## Feito em 29/10 (pelo Claude, no `iam-pessoas`)

| Passo da doc 09 §11.0 | O que foi feito | Registro em `supabase_migrations` |
|---|---|---|
| 6 | Migration `0004_abas-do-time` (também em `drizzle.__drizzle_migrations_eventos`, mesmo hash do arquivo) | `eventos_0004_abas_do_time` |
| 6 | Migration `0005_papeis-do-app`: papéis `app_eventos`, `app_eventos_leitura`, `app_eventos_copia` (NOLOGIN) | `eventos_0005_papeis_do_app` |
| 1 e 2 | `docs/gh-proposta-papeis-do-eventos.sql`: perfis `EVENTOS_TIME`/`EVENTOS_LIDER`, grants e políticas em `core` | `gh_0004_perfis_e_papeis_do_eventos` |

- Antes da 0004: os dados passavam nos CHECKs novos (`status_escala` só `SEM_ESCALA`/`RASCUNHO`, nenhuma convocação,
  nenhuma mensagem `ENVIADA` sem data). A 0004 só mudou dados em `modelo_copy` (`ESCALADO(A)` → `{{genero:…}}`);
  o `.down.sql` desfaz a estrutura.
- **GH-System:** copiar a `gh_0004_perfis_e_papeis_do_eventos` (versão `20261029215622`, conteúdo igual ao arquivo da
  proposta) para as migrations do GH, para o repositório não divergir do banco.
- Conferido com `has_table_privilege`: os dois papéis do app leem `eventos` e `core` como previsto; nenhum tem `INSERT`
  em `eventos.evento`.

## Bloqueio para liberar escrita (P4), não para a demo

O passo 8 da doc 09 (`ALTER ROLE app_eventos SET eventos.ambiente = 'producao'`) **não roda no Supabase**: o `postgres`
de lá não é superusuário e não pode gravar um parâmetro próprio (`eventos.*`) num papel (`permission denied to set
parameter`). A trava 3 do modo PRODUCAO (`src/core/ambiente`) depende desse marcador. Antes da P4, trocar o marcador
por algo que o `postgres` consiga gravar (por exemplo, `COMMENT ON ROLE app_eventos IS 'eventos.ambiente=producao'`,
lido de `pg_shdescription`) ou pedir ao suporte do Supabase o parâmetro em `supautils`.

## Falta (Vitor)

### 1. Senha do papel de leitura (Supabase › SQL Editor)

```sql
ALTER ROLE app_eventos_leitura WITH LOGIN PASSWORD '<senha forte, gerada por você>';
```

A `DATABASE_URL` da web fica (Transaction pooler, porta 6543; o usuário leva o ref do projeto):

```
postgresql://app_eventos_leitura.rpnyvqinqdvqwripqlxj:<senha>@aws-1-sa-east-1.pooler.supabase.com:6543/postgres
```

A senha fica só no Easypanel. `app_eventos` e `app_eventos_copia` continuam sem login.

### 2. Google no Supabase Auth (depois; não precisa para a demo sem login)

1. Google Cloud › APIs e serviços › Credenciais › Criar ID do cliente OAuth › "Aplicativo da Web".
   URI de redirecionamento autorizado: `https://rpnyvqinqdvqwripqlxj.supabase.co/auth/v1/callback`.
2. Supabase › Authentication › Sign In / Providers › Google: ligar e colar o ID e o segredo do cliente.
3. Supabase › Authentication › URL Configuration › Redirect URLs: incluir `https://eventos.iamcontrol.com.br/auth/callback`
   (sem curinga). **Não trocar a Site URL** se o GH já usa.
4. Decidir "Allow new users to sign up" (doc 09 §2.4). Conta nova sem `core.usuario` não entra no Eventos de qualquer jeito.

### 3. Quem entra (depois; não precisa para a demo sem login)

O login procura `core.usuario` pelo e-mail da conta Google (ativo, sem `deleted_at`) e exige o perfil com escopo
`GLOBAL`. Hoje `core.usuario` está vazia. Para cada pessoa da demo (troque e-mail e nome):

```sql
WITH u AS (
  INSERT INTO core.usuario (email, nome_usuario, ativo) VALUES ('pessoa@exemplo.com', 'Nome', true)
  ON CONFLICT (email) DO UPDATE SET ativo = true RETURNING id
)
INSERT INTO core.usuario_perfil (usuario_id, perfil_id, escopo)
SELECT u.id, p.id, 'GLOBAL' FROM u, core.perfil p WHERE p.codigo = 'EVENTOS_LIDER'  -- ou EVENTOS_TIME
ON CONFLICT DO NOTHING;
```

Só a Patricia recebe `EVENTOS_LIDER` (doc 09 §13.1). Na demo somente leitura o perfil só decide o que aparece.

### 4. Easypanel (serviço `eventos-web`)

- **Origem:** GitHub `infinityintelligence07-tech/eventos`, branch `claude/loving-allen-hw93eh`, build por **Dockerfile**
  (`Dockerfile` na raiz; o último estágio é a web, então não precisa de target).
- **Variáveis** (o Easypanel também as passa como build args; `EVENTOS_URL_PUBLICA` é lida no build):

  ```
  EVENTOS_MODO=demo
  DATABASE_URL=<a do passo 1>
  EVENTOS_URL_PUBLICA=https://eventos.iamcontrol.com.br
  LOG_LEVEL=info
  ```

  Quando ligar o login (passos 2 e 3): tirar `EVENTOS_MODO=demo` e incluir
  `NEXT_PUBLIC_SUPABASE_URL=https://rpnyvqinqdvqwripqlxj.supabase.co` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_6xd4FjpJcUNtKcpUYoRsKg_sctjPGE4` (chave pública).
  Nunca `EVENTOS_ESCRITA`, `DATABASE_URL_ESCRITA` nem a `service_role`.
- **Domínio:** `eventos.iamcontrol.com.br` → porta `3000`, HTTPS ligado.
- **Worker:** não precisa para a demo. A sincronização de turmas pode continuar à mão (`npm run sync:turmas`).
  O worker com papel próprio (`app_eventos_worker`, R7) fica para a próxima rodada.

### 5. Cloudflare (zona `iamcontrol.com.br`)

1. **DNS:** registro `A` `eventos` → IP do servidor do Easypanel. Crie como **DNS only** (nuvem cinza), espere o
   Easypanel emitir o certificado (Let's Encrypt) e só então ligue o **proxy** (nuvem laranja).
2. **SSL/TLS:** modo **Full (strict)** (o Easypanel já tem certificado válido).
3. **Access** (Zero Trust › Access › Applications › Add › Self-hosted):
   - domínio `eventos.iamcontrol.com.br`, caminho vazio (o site inteiro);
   - política **Allow** com *Include › Emails* (a lista da demo: Patricia, time, Vitor);
   - método de login: One-time PIN (código por e-mail; não precisa configurar nada) ou Google.
   **Ligue o Access antes de ligar o proxy do DNS**: sem ele a demo fica aberta.
4. Deixe desligados o Rocket Loader e o "Email Address Obfuscation" (mexem no HTML do Next).

### 6. Conferir no ar (doc 09 §11.0, passo 12)

```bash
curl -sI https://eventos.iamcontrol.com.br/login
```

Sem o cookie do Access, a resposta deve ser um redirecionamento para `*.cloudflareaccess.com`. No navegador:

- e-mail da lista → código do Access → `/inicio`, com "Visitante (demo)" e o selo "Demo · somente leitura";
- e-mail fora da lista → o Access recusa;
- botões de gravar aparecem desabilitados (somente leitura);
- no SQL Editor, `SELECT usename, application_name FROM pg_stat_activity WHERE usename = 'app_eventos_leitura';`
  mostra as conexões da web com o papel de leitura.
