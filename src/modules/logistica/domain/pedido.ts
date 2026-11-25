// Pedido à SDC, voo e hospedagem (docs/07 §4.5). Nós solicitamos, a SDC compra e o time registra o retorno.
// "A pedir" não é gravado: é só um lembrete de quem está na escala com deslocamento VOO e sem pedido ativo.

/** Valores do CHECK pedido_sdc_situacao_check. */
export type SituacaoDoPedido = "PEDIDO" | "EMITIDO" | "ALTERADO" | "CANCELADO";
export type TipoDoPedido = "VOO" | "HOSPEDAGEM";
export type Sentido = "IDA" | "VOLTA";
export type PreferenciaDeHorario = "MANHA" | "TARDE" | "NOITE" | "QUALQUER";

/** Situação na tela: o pedido gravado ou "a pedir". */
export type SituacaoDoVoo = "A_PEDIR" | SituacaoDoPedido;

export type AcaoNoPedido = "ALTERAR" | "REGISTRAR_RETORNO" | "CANCELAR";

export type TransicaoDoPedido = { para: SituacaoDoPedido } | { erro: "TRANSICAO_INVALIDA" };

const INVALIDA: TransicaoDoPedido = { erro: "TRANSICAO_INVALIDA" };

export function transicaoDoPedido(atual: SituacaoDoPedido, acao: AcaoNoPedido): TransicaoDoPedido {
  switch (atual) {
    case "PEDIDO":
      switch (acao) {
        case "ALTERAR":
          return { para: "PEDIDO" };
        case "REGISTRAR_RETORNO":
          return { para: "EMITIDO" };
        case "CANCELAR":
          return { para: "CANCELADO" };
        default:
          return acaoDesconhecida(acao);
      }
    case "EMITIDO":
      switch (acao) {
        case "ALTERAR":
          return { para: "ALTERADO" };
        case "REGISTRAR_RETORNO":
          // Corrigir a compra já registrada (valor, voo, reserva). Se o pagamento já foi aprovado, quem decide é
          // domain/pagamento.ts: a SDC não corrige e, quando o time corrige, a aprovação cai.
          return { para: "EMITIDO" };
        case "CANCELAR":
          return { para: "CANCELADO" };
        default:
          return acaoDesconhecida(acao);
      }
    case "ALTERADO":
      switch (acao) {
        case "ALTERAR":
          return { para: "ALTERADO" };
        case "REGISTRAR_RETORNO":
          return { para: "EMITIDO" };
        case "CANCELAR":
          return { para: "CANCELADO" };
        default:
          return acaoDesconhecida(acao);
      }
    case "CANCELADO":
      return INVALIDA;
    default: {
      const desconhecida: never = atual;
      throw new Error(`situação de pedido desconhecida: ${String(desconhecida)}`);
    }
  }
}

function acaoDesconhecida(acao: never): never {
  throw new Error(`ação no pedido desconhecida: ${String(acao)}`);
}

/** Ativo = não cancelado. A pessoa pode ter mais de um pedido de voo ativo no mesmo evento (a tela avisa antes). */
export function pedidoAtivo(situacao: SituacaoDoPedido): boolean {
  return situacao !== "CANCELADO";
}

/** Aguarda resposta da SDC: pedido novo ou alterado depois da emissão. */
export function aguardandoSdc(situacao: SituacaoDoPedido): boolean {
  switch (situacao) {
    case "PEDIDO":
    case "ALTERADO":
      return true;
    case "EMITIDO":
    case "CANCELADO":
      return false;
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de pedido desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Doc 08 §13. */
export function rotuloDaSituacaoDoVoo(situacao: SituacaoDoVoo): string {
  switch (situacao) {
    case "A_PEDIR":
      return "A pedir";
    case "PEDIDO":
      return "Pedido à SDC";
    case "EMITIDO":
      return "Emitido";
    case "ALTERADO":
      return "Alterado pelo time";
    case "CANCELADO":
      return "Cancelado";
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de voo desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function rotuloDoSentido(sentido: Sentido): string {
  switch (sentido) {
    case "IDA":
      return "ida";
    case "VOLTA":
      return "volta";
    default: {
      const desconhecido: never = sentido;
      throw new Error(`sentido desconhecido: ${String(desconhecido)}`);
    }
  }
}

export function rotuloDaPreferencia(preferencia: PreferenciaDeHorario): string {
  switch (preferencia) {
    case "MANHA":
      return "manhã";
    case "TARDE":
      return "tarde";
    case "NOITE":
      return "noite";
    case "QUALQUER":
      return "qualquer horário";
    default: {
      const desconhecida: never = preferencia;
      throw new Error(`preferência desconhecida: ${String(desconhecida)}`);
    }
  }
}

export type TrechoDesejado = {
  sentido: Sentido;
  origemIata: string;
  destinoIata: string;
  /** AAAA-MM-DD */
  dataDesejada: string;
  preferenciaHorario: PreferenciaDeHorario | null;
};

function dataCurta(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** Texto pronto para mandar à SDC pelo canal de hoje ("Copiar pedido"). */
export function textoDoPedidoDeVoo(pedido: {
  referencia: string;
  eventoCodigo: string | null;
  eventoNome: string;
  passageiro: string;
  trechos: TrechoDesejado[];
  observacaoTime: string | null;
}): string {
  const ordenados = [...pedido.trechos].sort((a, b) => (a.sentido === b.sentido ? 0 : a.sentido === "IDA" ? -1 : 1));
  const linhas = [
    `Pedido ${pedido.referencia} — passagem aérea`,
    `Evento: ${pedido.eventoCodigo ?? pedido.eventoNome}`,
    `Passageiro: ${pedido.passageiro}`,
    ...ordenados.map(
      (trecho) =>
        `${trecho.sentido === "IDA" ? "Ida" : "Volta"}: ${trecho.origemIata} → ${trecho.destinoIata} em ${dataCurta(trecho.dataDesejada)}` +
        (trecho.preferenciaHorario ? ` (${rotuloDaPreferencia(trecho.preferenciaHorario)})` : ""),
    ),
  ];
  if (pedido.observacaoTime) linhas.push(`Observação: ${pedido.observacaoTime}`);
  return linhas.join("\n");
}

const quantos = (quantidade: number, um: string, varios: string) => `${quantidade} ${quantidade === 1 ? um : varios}`;

/**
 * Texto pronto da solicitação de hospedagem ("Copiar pedido"). Quem escolhe e reserva o hotel é a SDC: o time manda o
 * evento, onde ele acontece, as datas, quantos quartos e pessoas e quem divide com quem. `hotel` só vem preenchido
 * quando já se sabe qual é (preferência do time ou reserva já registrada).
 */
export function textoDoPedidoDeHospedagem(pedido: {
  referencia: string;
  eventoCodigo: string | null;
  eventoNome: string;
  /** Local e cidade do evento, para a SDC procurar hotel perto. */
  localDoEvento: string | null;
  hotel: string | null;
  checkIn: string;
  checkOut: string;
  quartos: { nome: string; capacidade: number; ocupantes: string[] }[];
  observacaoTime: string | null;
}): string {
  const pessoas = pedido.quartos.reduce((total, quarto) => total + quarto.ocupantes.length, 0);
  const linhas = [
    `Pedido ${pedido.referencia} — hospedagem`,
    `Evento: ${pedido.eventoCodigo ?? pedido.eventoNome}`,
    ...(pedido.localDoEvento ? [`Local do evento: ${pedido.localDoEvento}`] : []),
    ...(pedido.hotel ? [`Hotel: ${pedido.hotel}`] : []),
    `Check-in ${dataCurta(pedido.checkIn)} · check-out ${dataCurta(pedido.checkOut)}`,
    `${quantos(pedido.quartos.length, "quarto", "quartos")} · ${quantos(pessoas, "pessoa", "pessoas")}`,
    ...pedido.quartos.map((quarto) => `${quarto.nome} (${quarto.capacidade} ${quarto.capacidade === 1 ? "pessoa" : "pessoas"}): ${quarto.ocupantes.join(", ") || "—"}`),
  ];
  if (pedido.observacaoTime) linhas.push(`Observação: ${pedido.observacaoTime}`);
  return linhas.join("\n");
}

export function mensagemDaTransicaoInvalida(situacao: SituacaoDoPedido): string {
  if (situacao === "CANCELADO") return "Este pedido foi cancelado: não dá mais para mexer nele.";
  return "Esta ação não vale para o pedido agora. Recarregue a página.";
}
