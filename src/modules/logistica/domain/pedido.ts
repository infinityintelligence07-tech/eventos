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

/**
 * O que o time pede num trecho: de que cidade a pessoa sai e a que cidade chega ("Porto Alegre (RS)"). O time não
 * escolhe aeroporto: quem escolhe é a SDC, que informa o código ao registrar a compra.
 */
export type TrechoDesejado = {
  sentido: Sentido;
  origemCidade: string;
  destinoCidade: string;
  /** AAAA-MM-DD */
  dataDesejada: string;
  preferenciaHorario: PreferenciaDeHorario | null;
};

/**
 * As pontas de um trecho como estão gravadas. Cidade: o que o time pediu (vazia nos pedidos anteriores à 0020, que só
 * têm o aeroporto). Aeroporto (código de 3 letras): o que a SDC informou na compra, ou o que o pedido antigo trazia.
 */
export type PontasDoTrecho = { origemCidade: string | null; destinoCidade: string | null; origemIata: string | null; destinoIata: string | null };

/** "Porto Alegre (RS)". Sem UF fica só a cidade; sem cidade, nulo. */
export function cidadeComUf(cidade: string | null | undefined, uf: string | null | undefined): string | null {
  const nome = cidade?.trim();
  if (!nome) return null;
  const sigla = uf?.trim().toUpperCase();
  return sigla ? `${nome} (${sigla})` : nome;
}

/** Para comparar cidades digitadas: sem maiúsculas, acentos, pontuação nem espaços repetidos. */
export function cidadeNormalizada(cidade: string): string {
  return cidade
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const mesmaCidade = (a: string, b: string) => cidadeNormalizada(a) === cidadeNormalizada(b);

/** "Porto Alegre (RS) → Manaus (AM)": o que o time pediu. Nulo no pedido antigo, que só tem aeroporto. */
export function cidadesDoTrecho(trecho: PontasDoTrecho): string | null {
  if (!trecho.origemCidade && !trecho.destinoCidade) return null;
  return `${trecho.origemCidade ?? trecho.origemIata ?? "—"} → ${trecho.destinoCidade ?? trecho.destinoIata ?? "—"}`;
}

/** "POA → MAO": os aeroportos, quando há algum (a ponta ainda sem aeroporto fica "—"). Nulo enquanto a SDC não informa. */
export function aeroportosDoTrecho(trecho: PontasDoTrecho): string | null {
  if (!trecho.origemIata && !trecho.destinoIata) return null;
  return `${trecho.origemIata ?? "—"} → ${trecho.destinoIata ?? "—"}`;
}

/** Em cada ponta, o aeroporto quando houver e a cidade quando não: "Porto Alegre (RS) → Manaus (AM)" e, depois da compra, "POA → MAO". */
export function rotaDoTrecho(trecho: PontasDoTrecho): string {
  return `${trecho.origemIata ?? trecho.origemCidade ?? "—"} → ${trecho.destinoIata ?? trecho.destinoCidade ?? "—"}`;
}

/** Por extenso, para textos e painéis: as cidades e, quando já há, os aeroportos. Pedido antigo: só os aeroportos. */
export function rotaPorExtenso(trecho: PontasDoTrecho): string {
  const cidades = cidadesDoTrecho(trecho);
  const aeroportos = aeroportosDoTrecho(trecho);
  if (!cidades) return aeroportos ?? "—";
  return aeroportos ? `${cidades} (aeroportos ${aeroportos})` : cidades;
}

/**
 * O aeroporto de uma ponta depois que o time altera o pedido. Fica o que estava quando a cidade não mudou (ou quando
 * o trecho ainda não tinha cidade: é pedido antigo, e o aeroporto era o próprio pedido). Cidade nova = sem aeroporto,
 * até a SDC informar o da nova compra.
 */
export function aeroportoAoAlterar(atual: { cidade: string | null; iata: string | null } | null, novaCidade: string): string | null {
  if (!atual?.iata) return null;
  return atual.cidade === null || mesmaCidade(atual.cidade, novaCidade) ? atual.iata : null;
}

/**
 * O aeroporto de uma ponta depois do registro (ou da correção) da compra. Informado = vale o informado. Em branco =
 * sem aeroporto, a não ser que o trecho não tenha cidade (pedido antigo): aí fica o que estava, para a ponta não
 * ficar sem nada.
 */
export function aeroportoAoRegistrar(atual: { cidade: string | null; iata: string | null }, informado: string | undefined): string | null {
  if (informado) return informado;
  return atual.cidade === null ? atual.iata : null;
}

function dataCurta(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** Texto pronto para mandar à SDC pelo canal de hoje ("Copiar pedido"). */
export function textoDoPedidoDeVoo(pedido: {
  referencia: string;
  eventoCodigo: string | null;
  eventoNome: string;
  passageiro: string;
  trechos: (PontasDoTrecho & Pick<TrechoDesejado, "sentido" | "dataDesejada" | "preferenciaHorario">)[];
  observacaoTime: string | null;
  /** Só na turnê de Masterclass: onde é a primeira palestra (a ida chega) e a última (a volta sai). */
  turne?: { primeiraPalestra: string; ultimaPalestra: string } | null;
}): string {
  const ordenados = [...pedido.trechos].sort((a, b) => (a.sentido === b.sentido ? 0 : a.sentido === "IDA" ? -1 : 1));
  const linhas = [
    `Pedido ${pedido.referencia} — passagem aérea`,
    ...(pedido.turne
      ? [`Masterclass (turnê) — primeira palestra: ${pedido.turne.primeiraPalestra}`, `Última palestra: ${pedido.turne.ultimaPalestra}`]
      : [`Evento: ${pedido.eventoCodigo ?? pedido.eventoNome}`]),
    `Passageiro: ${pedido.passageiro}`,
    ...ordenados.map(
      (trecho) =>
        `${trecho.sentido === "IDA" ? "Ida" : "Volta"}: ${rotaPorExtenso(trecho)} em ${dataCurta(trecho.dataDesejada)}` +
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
