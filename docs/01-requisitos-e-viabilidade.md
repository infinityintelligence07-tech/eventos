# Sistema Eventos — Requisitos e Viabilidade (v0.2)

> Etapas 1 e 2 do processo de criação (`processo_criacao_app.md`). Nome do sistema a definir.
> Base: anotações do Vitor, copys enviadas pela Patricia e leitura (somente visualização) das planilhas
> BD 2026, Master Class 2026, BD Time Eventos, Voos e Hospedagem 2027, Faturados SDC e Solicitação de Custo 2026.
> A planilha "Voos e Hospedagem 2026" não abriu (sem permissão ou ID errado).

## 0. Princípio

Não é "levar a planilha para um app". Cada tela precisa **eliminar uma etapa**, não só mudar o lugar
onde ela é digitada. Regra prática: o time de eventos **decide e aprova**; o sistema **calcula,
sugere, gera e cobra**; staff e SDC **confirmam e anexam**, cada um no seu próprio canal.

## 1. Diagnóstico do processo atual

### 1.1 Volume (2026, dados das planilhas)

| Item | Ordem de grandeza |
|---|---|
| Eventos grandes (IPR/ASM, Confronto, Liberty, MG, Legacy, Trainer…) | ~80/ano, ~1.060 alocações |
| Masterclass | ~57 em 3 semanas no pico (10+/dia), ~290 alocações |
| Pessoas no time (staffs) | ~200 cadastradas em 9 polos; ~330 nomes no BD de custos |
| Solicitações de custo (form) | ~1.430/ano → ~4.000 linhas de pagamento → ~3.300 linhas de auditoria |
| Fatura SDC | ~350 itens/ano, R$ 40–80 mil/mês |
| Créditos de hotel | ~20 em aberto, vários já expirados (dinheiro perdido) |

### 1.2 Mapa das planilhas e o que cada uma faz

| Planilha | Função real | Dor principal |
|---|---|---|
| BD 2026 | Escala dos eventos (blocos de 7 colunas por evento, aba por mês) | Pessoa, local, datas e logística em texto livre; cor = dono do carro; "Carro N" digitado; tempo de trajeto calculado à mão |
| Master Class 2026 | Escala de MC (coluna por evento) | Logística escondida no nome ("– Carro 1", "(som)", "*"); mesmos trios copiados dia a dia |
| BD Time Eventos | Cadastro do time por polo | Contagem digitada no nome da aba; duplicados; endereço/cidade/telefone inconsistentes; desatualizado ("validar se alguém se mudou") |
| Voos e Hosp. 2027 | Linha do tempo, pedidos de voo, hotéis, rooming list, cotação, créditos | Escala redigitada 3–4 vezes; campos da SDC (preço, cia, localizador) vazios até alguém copiar; rooming list manual por sexo e diárias |
| Faturados SDC | Conferência da fatura mensal | Sem chave por item; produto e evento em texto livre; conciliação manual |
| Solicitação de Custo | Form do staff → pagamentos → auditoria | Staff digita nome e evento à mão; financeiro recalcula km × consumo × litro + pedágio + depreciação linha a linha; PIX e CPF por PROCV (#N/A quando o nome diverge) |

### 1.3 Causa raiz

1. **Não existe ID de pessoa nem de evento.** Tudo liga pelo nome digitado, e o mesmo evento tem
   5 grafias (IPR 209 / IPR_209 / IPR209…).
2. **A mesma informação é digitada várias vezes:** escala → linha do tempo → voos → rooming → custo → fatura.
3. **Regras existem, mas são aplicadas à mão:** quantidade de líderes, data de compra do voo (D-90),
   diárias por tipo de evento, depreciação por faixa de km.
4. **A comunicação acontece fora do dado:** copys no WhatsApp, pedidos à SDC por fora, cartão de
   embarque não registrado.

## 2. Atores

| Ator | Hoje | No sistema |
|---|---|---|
| Time de Eventos (Patricia e equipe) | Monta escala, pede voo, cota hotel, manda copy, confere custo | Aprova sugestões, trata exceções |
| Staff (time IAM que serve nos eventos) | Recebe copy no WhatsApp, preenche form de custo, manda comprovante | App/PWA: disponibilidade, aceite da escala, logística do evento, custo pré-calculado |
| Líder de evento | Recebe escala | Vê a equipe, horários, check-in no evento |
| SDC (agência terceira) | Recebe pedido por fora, devolve valores e cartão de embarque | Portal por link: recebe pedidos, informa valor, cia e localizador, anexa o cartão de embarque |
| Financeiro | Audita deslocamento, lança pagamento, confere fatura | Aprova em lote, trata só divergências, concilia a fatura automaticamente |
| Diretoria/CEO | Sem visão consolidada | Painel: custo por evento, por pessoa, por polo; previsto × realizado |

## 3. Requisitos funcionais (por módulo)

### M1. Cadastros mestres (fonte única)
- **Pessoa/Staff:** ID único, login pela conta IAM (Google OAuth, mesmo padrão do IAM Control),
  polo, endereço geocodificado, funções habilitadas (multi), veículo (sim/não, consumo km/l,
  lugares), camiseta (modelo e tamanho), sexo (para quarto), fez Confronto, CNPJ/MEI, PIX e CPF
  (campos sensíveis, acesso restrito). **O próprio staff mantém o cadastro atualizado**; o sistema
  pede revisão a cada X meses.
- **Evento:** importado do IAM Control (`turmas`: treinamento, polo, edição, datas) sem redigitar.
  Código canônico `SIGLA_POLO_EDIÇÃO`. Expectativa de público, status.
- **Local e Hotel:** cadastrados uma vez, com endereço, contato, preço de referência, forma de
  pagamento e avaliação.

### M2. Calendário (agenda de MC e eventos)
- Visão mês/semana de todos os eventos e MCs, com o status da escala em cada um (sem escala,
  rascunho, aprovada, comunicada, confirmada).

### M3. Disponibilidade (enquete)
- Abertura de enquete por período ("eventos de janeiro"): o staff marca no app em quais pode ir.
- Lembrete automático para quem não respondeu.
- Substitui o "pergunta um a um no WhatsApp" e alimenta a sugestão de escala.

### M4. Escala com sugestão automática
- **Modelo por tipo de evento**, com quantidades calculadas:
  - Confronto: líderes = expectativa ÷ 25; pai e mãe = pessoas na fila ÷ 15.
  - ASM: staff líder = (expectativa × 50%) ÷ 25; staff = 2 por staff líder.
  - Funções padrão: Staff Líder (só ASM), DJ, Social Media, Fotógrafo, Staff Camarim, Staff, Palco…
- **Sugestão de pessoas** por: disponibilidade, função habilitada, distância casa → local, rodízio
  (quem serviu menos recentemente), histórico. Mostra **quem está perto** do evento.
- **Caronas automáticas:** agrupa pessoas próximas no carro de quem tem veículo e calcula o tempo
  de trajeto (substitui a cor cinza, o "Carro N" e o "TEMPO" digitados).
- Copiar a equipe de outro evento ou MC (a mesma região na semana seguinte).
- **Aprovar escala** = um clique, registrado (quem e quando). A aprovação dispara a comunicação.

### M5. Comunicação (copys geradas)
- Modelos com variáveis: **escalação** (cidade, data, horário, link) e **hospedagem** (cidade,
  hotel, data, horário, função, deslocamento, hotel e endereço, colega de quarto).
- Gera a copy personalizada de cada pessoa. Envio direto (WhatsApp via Evolution Go / iam-disparos)
  **ou** botão "copiar" para mandar manualmente.
- O staff responde **Confirmo / Não posso** no app; a recusa abre a vaga com sugestão de substituto.

### M6. Voos (SDC)
- Quem precisa de voo vem da escala (distância ou deslocamento = voo). O pedido nasce sozinho.
- **Alerta D-90:** lista do que precisa ser comprado em cada janela.
- **Portal SDC:** a SDC vê os pedidos, informa valor, cia e localizador e anexa o cartão de
  embarque. O staff recebe tudo no app automaticamente.
- Cada pedido tem uma **referência única** (AER_EV_…), usada na fatura.

### M7. Hospedagem
- Cotação de hotel com comparativo (single/duplo/triplo × diárias + Uber).
- **Rooming list automática** por sexo e datas, editável (arrastar pessoas entre quartos), com
  Apto IAM como opção.
- Status: sem hospedagem → pendente → pré-reserva → aguardando pagamento → reservado.
- **Créditos de hotel:** registro com validade, alerta antes de expirar e sugestão de uso na
  próxima reserva no mesmo hotel.

### M8. Custos do staff (substitui o Google Form e a auditoria)
- O sistema **pré-calcula** o custo de cada pessoa escalada pela REGRA DE CUSTO: diárias e alimentação
  por tipo de evento + deslocamento (km real casa → local × consumo × litro + pedágio + depreciação
  por faixa de km) + adicionais (estacionamento, viagem de 3h, Apto IAM, valores fixos de DJ e fotógrafo).
- O staff só **confirma ou ajusta**, com comprovante (foto). Ajuste acima da tolerância vira exceção.
- Entrega ao Financeiro a solicitação já calculada e conferida. O pagamento continua no processo do Financeiro (fora do escopo).

### M9. Fatura SDC (conciliação)
- Importar a fatura (planilha/PDF) → cada item casa com a referência do pedido (voo ou hotel).
- Mostra divergências (valor diferente, item sem pedido, pedido sem faturamento), parcelas e a
  empresa pagadora (IAM × Liberty).

### M10. Painéis
- Custo por evento (previsto × realizado), por polo, por pessoa e por tipo (voo, hotel, deslocamento).
- Participação de cada staff (eventos no ano, recusas, confiabilidade).

## 4. Fluxo novo (resumo)

```
IAM Control (turmas) ──► Calendário ──► Enquete de disponibilidade ──► Escala sugerida
     ──► Aprovar ──► Copy de escalação (WhatsApp/app) ──► Staff confirma
     ──► [voo?] Pedido SDC (D-90) ──► SDC informa valor + cartão de embarque ──► Staff vê no app
     ──► [hotel?] Cotação ──► Rooming automática ──► Copy de hospedagem
     ──► Evento ──► Custo pré-calculado ──► Staff confirma ──► Financeiro aprova lote ──► Pagamento
     ──► Fatura SDC ──► Conciliação automática por referência
```

Etapas eliminadas: redigitar a escala (3–4 vezes), perguntar a disponibilidade um a um, calcular
carro e tempo à mão, montar a copy, copiar os retornos da SDC, preencher o form de custo, auditar o
km linha a linha, procurar o PIX por nome, conciliar a fatura sem chave.

## 5. Requisitos não funcionais

- **Segurança/LGPD:** CPF, PIX e endereço são dados pessoais. Criptografia em repouso para os
  sensíveis, acesso por papel (staff vê só o próprio cadastro; o financeiro vê o PIX), log de auditoria.
  Portal da SDC com link de acesso limitado, sem ver dados além do necessário (nome, documento para emissão).
- **Acesso:** login com a conta Google da IAM (padrão do IAM Control). Staff em PWA mobile-first.
- **Integrações:** IAM Control (turmas e pessoas, via webhook com token, padrão já usado no iam-disparos),
  WhatsApp (Evolution Go), Google Maps/Distance Matrix (km e tempo), armazenamento de comprovantes
  e cartões de embarque.
- **Rastreabilidade:** toda aprovação, alteração de escala e pagamento registra quem e quando.
- **Migração:** importar o histórico de 2026 (pessoas, eventos, custos) com deduplicação de nomes.

## 6. Viabilidade

### Técnica — alta
Stack já dominada pela IAM: NestJS + React (Vite/shadcn) ou Next.js, Postgres (Supabase isolado
por conter dados sensíveis), deploy EasyPanel/Cloudflare Pages. As integrações seguem padrões
existentes (webhook do IAM Control, Evolution Go). O ponto novo é a API de mapas (custo baixo por
consulta, com cache por endereço).

Já existe um projeto Supabase "Criador Escalas" (tabelas `eventos`, `membros_escala`, `usuarios`,
`event_logos`, 2 eventos de teste). Avaliar se vira a base ou se começa do zero.

### Operacional — média (o risco está nas pessoas, não no código)
- ~200 staffs precisam passar a usar o app (aceite, cadastro, custo). Mitigação: o primeiro acesso
  já vem preenchido (importado das planilhas); o WhatsApp continua sendo o canal de aviso.
- A SDC precisa aceitar um portal. Plano B: o time de eventos lança o retorno da SDC (ainda assim
  com referência única).
- Qualidade do dado inicial: deduplicar ~330 nomes e ~80 códigos de evento.

### Financeira — retorno claro
- Tempo: elimina a redigitação e a auditoria manual (~3.300 linhas/ano) e o form de ~1.430 respostas.
- Dinheiro: créditos de hotel expirados, divergências de fatura não detectadas e km superestimado
  passam a ser visíveis.

### Entrega sugerida (MVP em fases)
| Fase | Escopo | Por quê primeiro |
|---|---|---|
| 1 | Cadastros + Calendário + Escala (sugestão, caronas, aprovação) + Copys | Raiz de tudo: cria os IDs que as outras fases usam |
| 2 | App do staff (confirmação, logística) + Enquete | Tira o vaivém do WhatsApp |
| 3 | Custos pré-calculados + aprovação em lote | Maior volume manual (form + auditoria) |
| 4 | Voos/Hotel + Portal SDC + Conciliação da fatura + Créditos | Depende das referências criadas nas fases anteriores |
| 5 | Painéis de gestão | Com os dados limpos, sai quase de graça |

## 7. Decisões (v0.2, respostas do Vitor em 21/10/2026)

1. **Login e base:** usar o banco do IAM Control. O login é o mesmo do IAM Control e do Sistema
   Eventos. Quem não tem cadastro no IAM Control pode se cadastrar pelo Eventos, do mesmo jeito.
2. **Pagamento é do Financeiro e fica fora do escopo.** O cadastro do staff guarda a chave PIX
   (entre outras informações) e pronto. O M8 deixa de ter aprovação e lote de pagamento: o sistema
   só pré-calcula a solicitação de custo e entrega ao Financeiro.
3. **SDC:** os dois canais. Portal para quem usar e lançamento pelo time quando vier por WhatsApp ou
   e-mail, sempre com referência única.
4. **Escala de Masterclass:** montada pelo mesmo time de eventos. Um só módulo de escala atende
   eventos e MC.
5. **Aprovação:** feita pela líder do time. Não dispara nada, só registra que a escala do evento
   está aprovada (quem e quando). O envio de copys é uma ação separada.
6. **Pai e mãe (Confronto):** atividade do evento em que o staff homem é "pai" e a staff mulher é
   "mãe" de participantes. Cada staff concilia uma fila de 15 pessoas. A quantidade sai das pessoas
   na fila ÷ 15, e o sexo do cadastro define pai ou mãe.
7. **Supabase "Criador Escalas":** não é reconhecido. Se não estiver em uso, reaproveitar e renomear
   para "eventos". *Ponto a decidir:* como a base é o IAM Control (Postgres na VPS), o Supabase
   ficaria só para storage (comprovantes, cartões de embarque) ou não é usado.
8. **Maior dor:** planilhas e micro-processos repetidos (por exemplo, editar a copy do WhatsApp
   para cada pessoa escalada). Prioridade máxima: **copy personalizada gerada pelo sistema, pronta
   para copiar ou enviar sozinha**.
9. **Voos e Hospedagem 2026:** o link enviado é o mesmo arquivo de 2027, que já foi lido. O de 2026
   continua sem acesso, mas a estrutura é a mesma.

### Ajuste de fases
| Fase | Escopo |
|---|---|
| 1 | Login IAM Control + cadastro do staff + calendário + escala (eventos e MC) + **copys geradas e envio** + aprovação |
| 2 | App do staff (aceite, logística, enquete de disponibilidade) |
| 3 | Voos e hospedagem (portal SDC, rooming automática, créditos de hotel) |
| 4 | Solicitação de custo pré-calculada entregue ao Financeiro + conciliação da fatura SDC |
| 5 | Painéis |
