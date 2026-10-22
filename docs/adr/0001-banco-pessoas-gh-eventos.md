# ADR 0001 — GH e Eventos: dois apps, dois repositórios, um banco

- **Status:** aceito (v3, 22/10/2026). Substitui a v1 (banco "pessoas" separado do GH) e a v2 (monorepo).
- **Decisores:** Vitor Guedes e Lucas (TI)

## Contexto

- **GH e Eventos são apps diferentes, em repositórios diferentes**: `GH-System` (Lucas) e `eventos`
  (Vitor). Eles compartilham as mesmas pessoas, polos e eventos.
- O GH ("Hide GH": Next.js 15, Drizzle, Supabase Auth, pg-boss) já tem `usuario/perfil`,
  `setor/polo/cargo/nivel`, `pessoa/vinculo`, `sensivel.*`, `evento/escala/convocacao/presenca`,
  ponto, solicitações, documentos, benefícios, mural e auditoria.
- O projeto Supabase antigo do GH (`HIDE-GH`) está em `us-east-2` e só tem dados de teste.
- Hospedagem decidida: Supabase em `sa-east-1`, plano Pro, US$ 10/mês por projeto.

## Decisão

**Um projeto Supabase compartilhado, `iam-pessoas` (`sa-east-1`, ref `rpnyvqinqdvqwripqlxj`),
usado por dois apps em dois repositórios.** Cada repositório é dono das migrations de alguns
schemas, e só deles.

```
Supabase iam-pessoas (sa-east-1)
│
├─ Auth (um só) ── login único para GH e Eventos (Google, telefone/OTP, senha)
│
├─ core         dono: GH-System   usuario, perfil, setor, polo, cargo, nivel, pessoa, vinculo, notificacao
├─ sensivel     dono: GH-System   CPF, endereço, documentos, dados bancários/PIX
├─ gh           dono: GH-System   ponto, solicitação, documento, benefício, mural, trilha
├─ auditoria    dono: GH-System   log (os dois apps escrevem)
├─ eventos      dono: eventos     evento, escala/vaga, convocação/alocação, presença, carona, enquete,
│                                 copy/mensagem, voo, hotel, quarto, crédito, custo, fatura SDC
├─ pgboss_gh / pgboss_eventos     filas de jobs de cada app
│
├─ GH-System  (Next.js) ── migra core, sensivel, gh, auditoria · lê eventos.presenca (folha)
└─ eventos    (Next.js) ── migra eventos · lê core e sensivel (o que o papel permitir)
```

### Regras

1. **Uma pessoa, um registro.** `core.pessoa` é única. O Eventos nunca cria cadastro paralelo de
   pessoa, polo ou cargo.
2. **Cada repo só gera migration para os seus schemas.**
   - GH-System: `schemaFilter: ["core", "sensivel", "gh", "auditoria"]` (hoje ainda inclui `eventos`,
     ver regra 5); tabela de controle `drizzle.__drizzle_migrations`.
   - eventos: `schemaFilter: ["eventos"]`; tabela de controle **`drizzle.__drizzle_migrations_eventos`**,
     para os dois históricos não se misturarem.
3. **O Eventos lê `core`/`sensivel` com definições Drizzle somente leitura** (as mesmas colunas,
   sem gerar migration). Se precisar mudar `core` ou `sensivel`, abre PR no GH-System. Mudança
   nesses schemas é revisada por Vitor e Lucas, e nunca remove ou renomeia coluna sem aviso ao outro repo.
4. **O que só o Eventos precisa saber da pessoa fica no schema `eventos`**, ligado a `core.pessoa`:
   veículo e consumo, funções habilitadas para evento, camiseta, geolocalização do endereço,
   `iam_control_user_id`. Assim o Eventos evolui sem depender de migration no GH.
5. **Transferência das tabelas de evento** (confirmado por Vitor em 22/10/2026: o Eventos **assume e
   amplia** essas tabelas, que estão vazias; o módulo de eventos do GH passa a só ler e é ajustado
   quando o GH for organizado). `evento/escala/convocacao/presenca` nasceram no GH e
   hoje são criadas pela migration base do GH-System. Quando o repo `eventos` começar:
   (a) o eventos adota essas tabelas na primeira migration dele (snapshot com elas, sem `CREATE`);
   (b) o GH-System tira `eventos` do `schemaFilter` e mantém só definições de leitura (precisa da presença).
6. **Um papel de banco por app** (`app_gh`, `app_eventos`) com permissão só nos schemas que cada
   um escreve e leitura no resto. `anon`/`authenticated` sem acesso a nenhum schema dos apps
   (já aplicado). Os apps acessam o banco pelo servidor; o navegador não lê tabelas.
7. **Login único:** o mesmo Supabase Auth. O acesso a cada app vem de `core.perfil`, que vai
   ganhar a coluna `sistema` (`gh` | `eventos`) por PR no GH-System.

## Alternativas

| Opção | Por que não |
|---|---|
| Eventos como módulo do GH | São apps diferentes. |
| Monorepo com os dois apps (v2) | Os apps são separados; cada time mantém o seu repositório. |
| Banco "pessoas" separado do GH (v1) | Dois cadastros de pessoa. |
| Dois bancos sincronizados | Sincronizar pessoa entre bancos reproduz o problema das planilhas. |
| Terceiro repo só com o schema | Mais um repositório para manter; as regras 2 a 5 resolvem com dois. |
| Reaproveitar `HIDE-GH` | Está nos EUA; mudar agora, sem dado real, é barato. |

## Consequências

- (+) Uma pessoa, um ID, um login para os dois apps.
- (+) Cada repo evolui no seu ritmo; o Eventos guarda o que é dele no schema dele.
- (+) Dados de RH e de staff no Brasil, com backup gerenciado.
- (−) Mudança em `core`/`sensivel` exige combinação entre os dois repos.
- (−) As definições de leitura de `core` no eventos precisam acompanhar o GH-System (um teste no CI
  do eventos pode comparar com o banco: `drizzle-kit check`/introspecção).

## Situação da migração (22/10/2026)

1. ~~Criar o projeto `iam-pessoas` em `sa-east-1`.~~ Feito.
2. ~~Schema do Hide GH reorganizado nos schemas novos e aplicado no `iam-pessoas`.~~ Feito:
   migrations `0000_base`, `0001_seguranca-e-dados-iniciais`, `0002_uuid-v7-search-path`
   (25 tabelas, RLS em todas, sem acesso para `anon`/`authenticated`). O código está no
   GH-System, branch **`feat/banco-iam-pessoas`** (local, sem push), aguardando revisão do Lucas.
3. Configurar o Auth do `iam-pessoas` (Google, telefone, senha) e recriar os usuários de teste.
4. Apontar o GH para o `iam-pessoas` (`.env`) e validar no navegador.
5. Desligar o projeto `HIDE-GH` (economiza US$ 10/mês).
6. ~~Banco do Eventos~~ (feito em 22/10/2026): repo `eventos`, branch `feat/banco-eventos`, migrations
   0000 (adoção das tabelas do GH, sem alterar o banco), 0001 (fase 1: 18 tabelas novas e colunas novas
   nas adotadas), 0002 (RLS, protocolo, tipos de evento, funções, regras de custo iniciais e modelos de copy)
   e 0003 (índice). Aplicadas no `iam-pessoas`. No GH-System, a migration 0003 tirou o schema `eventos`
   do histórico do GH (sem alterar o banco). Falta criar o app no repo `eventos` seguindo as regras 2 a 6. Stack igual à do GH (Next.js 15, Drizzle,
   Supabase Auth, pg-boss, Zod, pino, Vitest); começa só pelo backend.
7. Distância e tempo de trajeto: **Google Maps Platform** (Routes API + Geocoding), decidido em 22/10/2026.
   Motivos: a Routes API devolve pedágio estimado no trajeto (o que tira a base própria de praças, cujos
   preços eram média por concessionária), geocodificação de endereço brasileiro é a mais confiável, e o
   volume (alguns milhares de rotas por ano, com cache por par de endereços) cabe na cota mensal gratuita.
   OpenRouteService foi descartado: não calcula pedágio e exigiria manter a base de praças. Antes de
   implementar, validar num teste a cobertura de pedágio da Routes API nas rotas dos polos.

## Revisitar quando
- O IAM Control virar o sistema central: avaliar se identidade e pessoa passam a viver nele.
- O volume de ponto e folha pedir banco próprio para `gh`.
