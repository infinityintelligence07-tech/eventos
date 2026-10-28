# Contexto e onde paramos (28/10/2026)

Resumo para retomar o trabalho do Sistema Eventos numa conversa nova.

## O projeto
- **Objetivo:** substituir as planilhas do time de eventos da IAM.
- **Perfis:** time de eventos (Patricia Zordenunes), staff (celular), SDC (agência de voos e hotel) e financeiro.
- **Dois apps, dois repositórios, um banco:** o GH-System e o Eventos usam o mesmo Supabase `iam-pessoas`.
  - O schema `eventos` é deste repositório.
  - `core`, `sensivel`, `gh` e `auditoria` são do GH (Lucas).
- **Stack:** Next.js 15, React 19, Drizzle, Zod, pg-boss (worker) e Vitest. Um `Dockerfile` com os targets `web` e `worker`, pensados para o Easypanel.
- **Processo de trabalho:** `/Users/vitorguedes/IAM/processo_criacao_app.md`.

## O que está pronto
- **Banco:** schema `eventos`, com as migrations 0001 a 0003 e as regras de vagas e de custo carregadas na 0002.
- **Backend:**
  - regras puras de vagas, copy e código do evento, com testes;
  - sincronização de turmas do IAM Control: `npm run sync:turmas` à mão, ou o worker a cada 30 minutos.
- **Wireframes** com 20 telas (time, staff, SDC e financeiro): artifact `https://claude.ai/artifact/4ZHquKsgY8r6deQUSn21k4`.
- **Docs:**
  - `04-planejamento-front.md`: decisões, telas e respostas do Vitor;
  - `05-roteiro-validacao-patricia.md`: roteiro da validação com a Patricia.
- **Rota de turmas no IAM Control: no ar desde 28/10.**
  - `GET https://iamcontrol.com.br/api/webhooks/eventos/turmas`, com o header `x-webhook-token`. PR #14 mergeado.
  - Testada: 401 sem token e 200 com token, com 893 turmas desde 28/09. Não traz dados de aluno.
  - Token no servidor: `EVENTOS_WEBHOOK_TOKENS` no `.env` de `/var/www/api` (VPS).
  - Token no Eventos: `IAM_CONTROL_EVENTOS_TOKEN` no `.env` deste repositório.
- **Polos:** 8 cadastrados em `core.polo` (AM, BC, BSB, CPS, GYN, LON, POA, VIX).
  - O CPS está com o nome "Americana" no IAM Control; aqui foi gravado como Campinas.

## Decisões principais (detalhe na doc 04)
- **Vagas:** sempre sugeridas pela regra, e quem monta a escala confirma o número.
  - Líderes do Confronto = público ÷ 25, arredondado para cima.
  - Staff do Confronto não tem número fixo: a Patricia decide em cada evento.
- **Público:** vem do IAM Control. É o maior entre a meta e os inscritos ativos, e pode ser editado.
- **Masterclass:** cada uma tem a sua equipe e a sua escala. O código segue o formato `MC_POLO_CIDADE`.
- **Sugestão de pessoas:** disponibilidade primeiro; depois entra o desempenho no evento.
- **Copy com dado faltando:** espera, e o sistema mostra um alerta para quem faz os envios. O envio é pelo WhatsApp, por um número do time.
- **Staff:**
  - confirma ou recusa a escala;
  - vê os colegas;
  - tem cadastro obrigatório no primeiro acesso.
- **SDC:**
  - tem uma página só dela, e o time vê os mesmos pedidos na aba "Logística e SDC";
  - divergência na fatura: o time de eventos decide se o valor está certo, e o financeiro paga.
- **Pagamento de custos:** o time de eventos confirma o valor, e o financeiro paga com essa confirmação.
- **Atualização ao vivo:** montar escala, comunicação e pedidos da SDC usam Supabase Realtime.
- **Ordem do front:** time de eventos → staff → SDC → financeiro.

## Onde paramos
1. **Primeira sincronização de turmas: bloqueada.** O `.env` do Eventos só tem o token. Falta o Vitor colar `DATABASE_URL`, a connection string do pooler do `iam-pessoas`. Depois:
   - rodar `npm run sync:turmas`;
   - conferir eventos, vagas e avisos de "polo não encontrado" ou código em conflito.
2. **Depois disso:** começar o front do fluxo do time (calendário → evento → montar escala → aprovação → comunicação), com Realtime nas telas compartilhadas.

## Em aberto
- **Horário do staff por dia:** igual para todos ou por função? Hoje as vagas entram 08:00–18:00 provisórias, e o horário aparece na copy.
- **Código da Masterclass:** como diferenciar duas na mesma cidade. A proposta é acrescentar a edição da turma.
- **Formato da fatura da SDC:** perguntar ao financeiro (planilha ou PDF, e se traz código por pedido).
- **Regras de custo:**
  - REMUN e ALIM são por evento ou por dia?
  - Com exatamente 250 km, paga R$ 80 ou R$ 250?
  - Montagem é por hora? Em que faixa caem 101–149 e 251–299 alunos?
  - Faltam o preço do litro e o consumo padrão.
  - Lista completa na doc 05.
- **Validação dos wireframes com a Patricia:** roteiro na doc 05.
- **Avisar o Lucas:** os polos entraram no `core`, e a rota nova está no backend dele.
- **Corrigir no IAM Control:** o nome do polo CPS ("Americana").
- **Copy:** trocar "ESCALADO(A)" por `{{genero:...}}` numa migration.

## Estado do Git
- **Eventos:** três branches locais, nenhuma enviada ao GitHub e nenhuma mergeada na `main`.
  - `feat/banco-eventos`;
  - `feat/base-backend`;
  - `feat/sincronizacao-turmas` (atual).
- **IAM Control:** `feat/integracao-eventos-turmas` mergeada na `main` (PR #14) e em produção.
- **Deploy do Eventos no Easypanel:** adiado até existir a primeira tela. Serão dois serviços (`web` e `worker`), com estas variáveis:
  - `DATABASE_URL` e `WORKER_DATABASE_URL`;
  - `IAM_CONTROL_URL` e `IAM_CONTROL_EVENTOS_TOKEN`;
  - `LOG_LEVEL`.

## Regras de trabalho combinadas
- **Segredos:**
  - não manipular segredos: o Vitor cola tokens e connection strings no `.env`;
  - nunca guardar segredos no vault.
- **GitHub:** não fazer push nem abrir PR sem pedido.
- **Arquivos e projetos:**
  - não commitar a pasta `design/`;
  - não apagar ainda o projeto Supabase antigo (HIDE-GH);
  - planilhas: só leitura;
  - não mexer nas mudanças não commitadas do repositório principal do IAM Control (branch `feat/integracao-disparos-liberty-idn`).
- **Vault:** atualizar o Obsidian (`10-Projetos/Projeto — Sistema Eventos.md`) a cada informação nova.
