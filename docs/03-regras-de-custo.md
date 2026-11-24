# Regras de custo do staff (v0.1)

> Decididas em 22/10/2026. Algumas vêm do app CUSTOS-STAFFS (Arno), aprovadas pelo Vitor para reaproveitar.
> Usadas pelo módulo de custos (M8) para pré-calcular a solicitação de cada pessoa escalada.

## Deslocamento de carro

- **Combustível:** `km_rodados / consumo_km_l × preco_litro`. Ida e volta conta os dois trechos.
- **Pedágio:** soma das praças no trajeto (ida e volta, ×2). Base inicial: praças da ANTT do CUSTOS-STAFFS, revisando preço por praça.
- **Depreciação por faixa de km:**

| Km rodados | Depreciação |
|---|---|
| abaixo de 100 km | R$ 0 |
| de 100 km a 249 km | R$ 80 |
| a partir de 250 km | R$ 250 |

  A faixa é aplicada **por evento, a cada deslocamento** (decidido em 22/10/2026). O CUSTOS-STAFFS
  aplicava por semana e por staff; essa parte não é reaproveitada.

## Exceções (o que o financeiro olha)

O custo dentro da regra passa direto. Vai para análise quando:

| Nível | Condição |
|---|---|
| Crítico | consumo abaixo de 7,5 km/l ou acima de 22 km/l, ou custo acima de R$ 0,95 por km |
| Alerta | consumo abaixo de 10 km/l, ou custo acima de R$ 0,70 por km |

## Status

Dois eixos independentes:

- **Auditoria (time de eventos):** `PENDENTE`, `APROVADO`, `REPROVADO`.
- **Financeiro:** `AGUARDANDO_AUDITORIA`, `AGUARDANDO_PAGAMENTO`, `PENDENTE_CADASTRO`, `PAGO`, `REJEITADO`.
  Aprovar na auditoria leva o financeiro para `AGUARDANDO_PAGAMENTO`; `PAGO` registra a data do pagamento.

## Formulário do staff e prazo (decidido em 24/11/2026)

- O staff envia a própria solicitação em `/solicitar-custo` (substitui o Google Forms). Só para evento em que está na escala.
- **Prazo:** do primeiro dia do evento até o fim do **5º dia depois do último dia do evento** (inclusive), no fuso de São Paulo.
  Depois disso, só o time registra em nome da pessoa.
- A pessoa informa o deslocamento de carro (km, consumo, preço do litro, pedágio) e outras despesas do deslocamento
  (estacionamento, ônibus…). O valor é calculado pelas regras desta página; ela não digita o total.
- **Remuneração e alimentação são fixas e o staff não pede** (decidido em 24/11/2026): entram sozinhas na solicitação
  que ele envia, pelas mesmas regras e com o mesmo valor inicial do registro do time (quantidade 1). Sem regra para o
  tipo do evento, nada entra. Regra por hora (Masterclass) ou por dia entra com 1 unidade: o time confere a quantidade.
  Quem não foi de carro e não teve despesa envia só com os fixos.
- **Comprovante** (foto ou PDF): obrigatório quando há deslocamento ou despesa; até 3 arquivos de 8 MB por solicitação.
  Fica desligado enquanto o armazenamento não estiver configurado (variáveis `COMPROVANTES_S3_*`).
- Reprovada, a pessoa corrige e reenvia até 5 dias depois da reprovação.
- Aprovada, o time copia a mensagem de "custo aprovado" e manda pelo WhatsApp. Envio automático: construção futura.

## Protocolo

`STF-AAAAMM-NNNN` (formato que o financeiro já conhece). `NNNN` vem de uma sequência no banco por mês,
sem repetição (no CUSTOS-STAFFS era aleatório).

## Exportação para o financeiro

O pagamento continua fora do sistema. O Eventos gera o lote no formato que o financeiro já importa:

- **Kamino Pay:** layout de 37 colunas; PIX como forma de pagamento; classificação 30117 "Custos Variáveis - Diárias e Deslocamento"; descrição `1012.1 | STAFF | EVENTO - protocolo` (eventos) ou `1013.1 | ...` (Masterclass).
- **Levflow:** Data Vencimento, Fornecedor, Favorecido, Descrição, Valor, Classificação, Categoria, Subcategoria, Banco, Observação.
- **Caju:** CSV com `;` e BOM: CPF, Nome, Categoria, Valor, Descricao, Protocolo, Data Competencia.

Valores sempre em centavos no banco e formatados só na exportação (o CUSTOS-STAFFS transformava R$ 123,45 em 12345).
Os layouts exatos de coluna serão copiados do `exportService.js` do CUSTOS-STAFFS na implementação.

## Valores configuráveis (decidido em 22/10/2026)

- **Cada deslocamento conta separado** na faixa de depreciação; a solicitação mostra um campo com a soma de todos.
- Todos os valores (alimentação por tipo de evento, faixas de depreciação, adicionais como estacionamento,
  viagem de 3h, Apto IAM, DJ e fotógrafo, preço do litro por UF) ficam na tabela `eventos.regra_custo` e
  serão editados numa aba **Configurações › Regras de custo**. Nada fica fixo no código.
- Valores iniciais: aba REGRA DE CUSTO da planilha de solicitação de custo (referência), ajustados depois pela aba de regras.

## Distância, tempo e pedágio

Provedor: **Google Maps Platform** (Routes API com informação de pedágio + Geocoding), com cache por
par de endereços. Ver a decisão no fim de `docs/adr/0001-banco-pessoas-gh-eventos.md`.
