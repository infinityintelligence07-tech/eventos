# Sistema Eventos — Planejamento do front (v0.1, em discussão)

Rascunho para planejar junto com o Vitor. Nada de interface começa antes de fechar este documento.

## Decisões (26/10/2026)

| Tema | Decisão |
|---|---|
| Auditoria dos custos | Time de eventos aprova ou reprova cada solicitação; o financeiro só recebe o que foi aprovado. |
| Login do staff | Conta Google (mesmo login do IAM Control); quem não tem cadastro se cadastra no primeiro acesso. |
| Visual | Mesmo do IAM Control: base TailAdmin (Next 15, Tailwind v4), cor da marca `#0034b8`, menu lateral, tema claro/escuro. Reaproveitar os tokens do `globals.css` do IAM Control, não o template inteiro. |
| Primeiro lançamento | Escala + copy, custos do staff, voos e hotel (SDC) e disponibilidade. |
| Login da SDC | E-mail + link mágico (cada pessoa da agência recebe o link no e-mail cadastrado, sem senha). |
| Envio das copys | Pelo WAHA, conectado a um número do time. O sistema envia e registra (`mensagem`: ENVIADA/FALHOU). Já existe WAHA em uso no `disparo_mensagens` (WEBJS, header `X-Api-Key`); o Eventos usa uma sessão própria. "Copiar" fica como alternativa se o envio falhar. |
| Validação | Wireframes no visual do IAM Control, revisados primeiro com o Vitor e depois com a Patricia, antes de codar. |
| Protótipo anterior | Não aprovado pelo visual (não parecia com os sistemas da IAM) e por não ter passado pelo time. O fluxo serve de base. |

## Perfis

| Perfil | Onde usa | Escopo |
|---|---|---|
| Time de eventos | Computador | Tudo de eventos, escala, comunicação, logística e auditoria de custos. |
| Líder do time | Computador | O mesmo do time + aprovar escala (só registra quem e quando). |
| Staff | Celular (PWA) | As próprias escalas, disponibilidade, cadastro e custos. |
| SDC | Portal web | Só os pedidos de voo/hotel e a fatura. |
| Financeiro | Computador | Custos aprovados, exportação de lotes, pagamento, fatura SDC. |

## Telas

### Time de eventos
- **Início:** o que precisa de ação hoje: escalas em rascunho, Confronto sem pessoas na fila,
  pendências da sincronização (polo sem cadastro, código repetido), voos na janela D-90, custos para auditar.
- **Calendário:** eventos e Masterclasses por mês e polo, cor por situação da escala.
- **Evento:** abas resumo (dados do IAM Control, só leitura; público e fila editáveis), escala,
  comunicação, logística e custos.
- **Montar escala:** vagas por função já calculadas; preencher com pessoas sugeridas (distância,
  disponibilidade, rodízio, função habilitada); ajustar vagas; enviar para aprovação.
- **Comunicação:** copy por pessoa com o que falta destacado; enviar pelo WAHA (uma pessoa ou todos de uma vez),
  situação do envio por pessoa, reenviar quando a copy ficar desatualizada; copiar como alternativa.
- **Disponibilidade:** abrir enquete para um período ou conjunto de eventos; acompanhar respostas.
- **Pessoas:** funções, veículo, camiseta, fez Confronto, endereço no mapa, histórico.
- **Logística:** pedidos de voo para a SDC, rooming list, caronas, créditos de hotel.
- **Auditoria de custos:** fila de solicitações com alertas de consumo e km, aprovar/reprovar com motivo.
- **Configurações:** regras de custo, regras de vagas por tipo, modelos de copy, locais e hotéis.

### Staff (celular)
- **Primeiro acesso / cadastro:** dados, PIX, endereço, veículo, camiseta, funções.
- **Minhas escalas:** função, horário, local, carona, voo, hotel, colega de quarto.
- **Disponibilidade:** marcar as datas em que pode.
- **Solicitar custos:** deslocamentos (km calculado), pedágio, adicionais, comprovantes; total e protocolo `STF-…`.
- **Meus custos:** situação (auditoria e pagamento) e motivo de reprovação.
- **Meu cadastro:** editar dados; aviso do que trava o pagamento.

### SDC
- **Pedidos:** voos e hotéis pedidos, com referência única.
- **Pedido:** companhia, localizador, valor, cartão de embarque.
- **Fatura:** envio da fatura do mês e o que casou ou não com os pedidos.

### Financeiro
- **Custos para pagar:** aprovados na auditoria, filtro por evento/período, cadastro pendente (sem PIX).
- **Exportar lote:** Kamino, Levflow, Caju.
- **Marcar pago / rejeitado:** com motivo.
- **Fatura SDC:** conciliação e aprovação do pagamento.

## Fluxos

1. **Evento:** turma no IAM Control → evento criado → (Confronto) time informa a fila → vagas completas.
2. **Escala:** enquete → respostas → time preenche com sugestões → líder aprova → copys → envio.
3. **Logística:** D-90 → pedido à SDC → SDC informa voo → staff vê na escala; rooming list e caronas.
4. **Custos:** staff solicita após o evento → time audita → financeiro exporta, paga e marca pago.
5. **Fatura SDC:** SDC envia a fatura → conciliação com os pedidos → financeiro aprova.

## Wireframes (26/10/2026)

Fluxo do time de eventos no visual do IAM Control, navegável: página privada no claude.ai
"Eventos — Wireframes do time" (https://claude.ai/artifact/4ZHquKsgY8r6deQUSn21k4). A Patricia só abre
depois de compartilhada pelo menu Share.

1. **Calendário:** mês com cor por situação da escala, filtros de polo e tipo, painel "Precisa de ação".
2. **Evento:** dados da turma (IAM Control, só leitura), expectativa e fila editáveis, vagas calculadas, andamento.
3. **Montar escala:** vagas por função (ajustáveis), pendência quando falta a fila, sugestões de pessoas.
4. **Aprovação:** fila da líder, resumo de atenção (voo, sem resposta, sem PIX), aprovar só registra.
5. **Comunicação:** situação por pessoa (pronta, falta dado, desatualizada, falhou, enviada), copy com o
   que falta destacado, envio pelo WhatsApp (WAHA), copiar como alternativa.

Nomes de staff aparecem como `[Staff NN]` e dados não confirmados entre colchetes.

### Staff no celular (segunda linha do mesmo canvas)

Telas de 390 px com barra inferior (Escalas, Disponibilidade, Custos, Cadastro):

1. **Entrar:** só "Entrar com Google", com o mesmo e-mail do IAM Control; dá para instalar como app (PWA).
2. **Primeiro acesso:** 4 etapas (dados, pagamento/PIX, endereço e veículo, funções). Dá para pular, mas fica um aviso.
3. **Minhas escalas:** aviso de cadastro incompleto, próximas escalas com "Confirmar / Não posso" e anteriores com atalho para solicitar custos.
4. **Detalhe da escala:** função, horário, local com mapa, voos (cartão de embarque), hotel e colega de quarto, carona.
5. **Disponibilidade:** enquete do período com "Posso / Não posso" por evento e "Posso em todos".
6. **Solicitar custos:** deslocamentos com km calculado pelo mapa, adicionais com comprovante, diárias e total; o envio gera o protocolo `STF-…`.
7. **Meus custos:** andamento (enviado → auditoria → aprovado → pago), motivo da reprovação e "Corrigir e reenviar".

Pontos a decidir nessas telas:
- o staff confirma presença na escala (não estava no fluxo original);
- se o staff vê a equipe do evento;
- se o cadastro pode ser pulado no primeiro acesso.

### SDC e financeiro (terceira e quarta linhas do canvas)

**SDC (portal web):**
1. **Entrar:** e-mail cadastrado → link mágico (sem senha, uso único).
2. **Pedidos:** lista com referência única, tipo, passageiro, trecho/hotel, data e situação (a emitir, emitido, alterado pelo time, cancelado).
3. **Informar voo:** o que a IAM pediu ao lado do formulário de emissão (companhia, voo, localizador, horários, valor, cartão de embarque). Ao salvar, o voo aparece na escala e na copy.
4. **Fatura:** envio da fatura do mês e conferência linha a linha com os pedidos (confere, valor diferente, sem pedido).

**Financeiro:**
1. **Custos para pagar:** só os aprovados na auditoria; os que estão sem PIX ficam travados; o lote é gerado a partir dos selecionados.
2. **Lote e baixa:** exportação para Kamino, Levflow ou Caju; marcar pago ou rejeitado (com motivo); "Importar retorno" como alternativa.
3. **Fatura SDC:** resumo da conferência e divergências com a justificativa do time de eventos. "Aprovar pagamento" só libera quando nada estiver em aberto.

Pontos a decidir nessas telas:
- formato da referência do pedido (`[REF-0001]` no wireframe) e da fatura da SDC (planilha, PDF ou os dois);
- validade do link mágico;
- baixa manual ou por arquivo de retorno (as duas aparecem);
- quem justifica divergência da fatura (no wireframe, o time de eventos).

### O que validar com a Patricia nos wireframes
- Horário padrão das vagas (08:00–18:00) e expectativa sugerida (maior entre meta e inscritos).
- Regra de vagas de Staff no Confronto (marcada como `[REGRA A CONFIRMAR]`).
- Critérios e ordem das sugestões (disponibilidade, função, distância, rodízio).
- Enviar a copy quando falta um dado (ex.: voo): bloquear, mandar sem a linha ou esperar.
- Devolver escala com comentário na aprovação.

## Respostas do Vitor (28/10/2026)

| Tema | Decisão | Efeito nas telas |
|---|---|---|
| Vagas | Sempre pré-preenchidas como sugestão pela regra; quem monta a escala **confirma o número**. Líderes do Confronto = expectativa ÷ 25 (máx. 25 por grupo), arredondando para cima. | Montar escala: cada função mostra "sugerido N" e pede confirmação antes de enviar para aprovação. |
| Sugestão de pessoas | Disponibilidade pesa mais; depois vai entrar o desempenho no evento (rastreio a criar). | Ordenar sugestões por disponibilidade; reservar espaço para desempenho. |
| Código da Masterclass | `MC_POLO_CIDADE`. | Falta saber como diferenciar duas na mesma cidade. |
| Aprovação | Comentário ao devolver é opcional. | Botão "Devolver" com comentário opcional. |
| Copy com dado faltando | Esperar e deixar alerta no sistema para quem cuida dos envios. | Envio bloqueado para essa pessoa + alerta na Comunicação e no Início. |
| WhatsApp | Um número do time (definido depois). | — |
| Confirmação do staff | O staff confirma ou recusa; a sugestão de substituto é para a líder na hora da escala, conforme a disponibilidade para o evento. | Mantém "Confirmar / Não posso". |
| Staff vê colegas | Sim. | Detalhe da escala: lista da equipe (nome e função). |
| Cadastro do staff | Obrigatório no primeiro acesso. | Tirar o "Depois" do cadastro. |
| SDC | Página só dela; a SDC não vê o resto do sistema. O time de eventos vê os mesmos pedidos numa aba SDC. | Time: aba/tela SDC em Logística. |
| Baixa do pagamento | O time de eventos confirma o valor (auditoria) e o financeiro paga com essa confirmação. | Sem arquivo de retorno; o financeiro marca pago. |
| Fatura SDC | Formato a confirmar com o financeiro. | — |
| Atualização das telas | Tudo lê o mesmo banco. Montar escala, comunicação e pedidos da SDC atualizam sozinhas (Supabase Realtime) quando outra pessoa muda algo; as outras telas atualizam ao abrir ou recarregar. | Implementar Realtime nessas três telas. Lembrar: turmas do IAM Control chegam a cada 30 min; mensagem enviada e lote exportado não mudam (ficam marcados como desatualizados). |
| Expectativa de público | Vem do IAM Control. A sincronização usa o maior entre a meta da turma e os inscritos ativos (sem cancelados e transferidos) e só preenche quando o campo está vazio. | Evento: expectativa editável; Montar escala recalcula a sugestão de líderes. |
| Staff no Confronto | Sem número fixo: a Patricia decide em cada evento. | Função Staff sem sugestão; quem monta digita o número. |
| Masterclass | Cada Masterclass tem a sua equipe (acontecem no mesmo horário). | Uma escala por Masterclass (uma turma = um evento), como já é gerado. |
| Divergência na fatura SDC | A Patricia/time de eventos decide se o valor está certo; o financeiro paga. | Fatura SDC: o time aceita ou contesta cada divergência; o financeiro só paga a fatura conferida. |
| Ordem de construção | Na ordem apresentada: time de eventos (calendário → escala → aprovação → comunicação), staff, SDC, financeiro. | Front começa pelo fluxo do time. |
| Regras de custo | O print da aba REGRA DE CUSTO bate com os valores já carregados no banco (migration 0002); o Vitor confirma se o print está atualizado. | — |

## Perguntas em aberto

- Horário do staff por dia (igual para todos ou por função) — hoje as vagas entram 08:00–18:00 provisórias.
- Código da Masterclass: como diferenciar duas `MC_POLO_CIDADE` iguais (proposta: acrescentar a edição da turma).
- Formato da fatura da SDC (com o financeiro).
- Regras de custo listadas no roteiro (`05-roteiro-validacao-patricia.md`).
