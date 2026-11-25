import { ErroDaLogistica, LogisticaMudouError } from "../domain/erros";
import {
  type AcaoNoPedido,
  mensagemDaTransicaoInvalida,
  type SituacaoDoPedido,
  type TipoDoPedido,
  type TrechoDesejado,
  transicaoDoPedido,
} from "../domain/pedido";
import {
  aprovacaoValeParaACompra,
  efeitoNaAprovacao,
  MENSAGEM_COMPRA_APROVADA,
  MENSAGEM_COMPRA_MUDOU,
  mensagemDaRecusaDaAprovacao,
  podeAprovarPagamento,
  podeDesfazerAprovacao,
  type QuemMexeNaCompra,
} from "../domain/pagamento";
import { dataEmSaoPaulo, instanteDeSaoPaulo } from "../domain/datas";
import { dataRealDoLancamento, mensagemDaRecusaDaTurne, validarTurne } from "../domain/turne";
import type { OrigemDoHotel } from "../domain/hotel";
import type {
  AlterarPedido,
  CancelarPedido,
  RegistrarPedidoDeHospedagem,
  RegistrarPedidoDeVoo,
  RegistrarRetornoDeHospedagem,
  RegistrarRetornoDeVoo,
} from "../domain/schemas";

// Casos de uso do pedido à SDC (docs/07 §4.5). Tudo roda no executor da transação do fluxo;
// as leituras travam a linha (FOR UPDATE) e as mudanças de situação são compare-and-set.

export type ContextoDaAcao = { usuarioId: string; instante: Date };

/**
 * Quem registra a compra de um pedido: alguém do time (em nome da SDC) ou a própria SDC, pela área dela. A pessoa da
 * SDC não tem core.usuario: é identificada pela linha dela em eventos.acesso_sdc.
 */
export type AutorDoRetorno = { usuarioId: string } | { acessoSdcId: string };
export type ContextoDoRetorno = { autor: AutorDoRetorno; instante: Date };

const quemMexe = (autor: AutorDoRetorno): QuemMexeNaCompra => ("acessoSdcId" in autor ? "SDC" : "TIME");

/** Evento do pedido, travado. `dataFim` no fuso de São Paulo (AAAA-MM-DD). */
export type EventoDoPedido = { id: string; dataInicio: string; dataFim: string; cancelado: boolean; /** Evento do tipo Masterclass (palestra). */ masterclass: boolean };

export type PedidoTravado = {
  id: string;
  referencia: string;
  tipo: TipoDoPedido;
  situacao: SituacaoDoPedido;
  eventoId: string;
  pessoaId: string | null;
  /** Só no voo: "também precisa de hotel". */
  precisaHotel: boolean;
  /** Dia em que o pedido foi feito à SDC (AAAA-MM-DD): a compra não pode vir antes dele. */
  dataSolicitacao: string;
  valorCentavos: number | null;
  /** Preenchido = pagamento aprovado pelo time. */
  aprovadoEm: Date | null;
  atualizadoEm: Date;
  sentidos: ("IDA" | "VOLTA")[];
};

export type TrechoEmitido = {
  sentido: "IDA" | "VOLTA";
  companhia: string;
  numeroVoo: string;
  localizador: string;
  partidaEm: Date;
  chegadaEm: Date;
  /** Ausente = não mexe na coluna (a SDC nunca grava nem apaga o link; só o time). */
  cartaoEmbarqueUrl?: string | null;
};

export type RegistroDoPedido = {
  pedidoId: string;
  eventoId: string;
  acao: string;
  statusDe?: SituacaoDoPedido | null;
  statusPara?: SituacaoDoPedido | null;
  comentario?: string | null;
  emNomeDePessoaId?: string | null;
  dados?: Record<string, unknown>;
};

export type RepositorioPedidos = {
  /** Trava o evento (serializa os pedidos dele). Nulo = não existe ou foi apagado. */
  travarEvento(eventoId: string): Promise<EventoDoPedido | null>;
  /** Evento sem trava (a última palestra de uma turnê de Masterclass). Nulo = não existe ou foi apagado. */
  eventoDoPedido(eventoId: string): Promise<EventoDoPedido | null>;
  /** Pessoa ativa do cadastro de staff (core.pessoa ativa com pessoa_evento). Nulo = não é staff ou está inativa. */
  staffAtivo(pessoaId: string): Promise<{ pessoaId: string; nome: string } | null>;
  /** Convocação principal ativa da pessoa no evento, se ela já estiver na escala (vínculo opcional do pedido). */
  convocacaoPrincipal(eventoId: string, pessoaId: string): Promise<string | null>;
  /** Referências dos pedidos de voo ativos da pessoa no evento. */
  pedidosDeVooAtivos(eventoId: string, pessoaId: string): Promise<string[]>;
  inserirPedido(pedido: {
    tipo: TipoDoPedido;
    eventoId: string;
    pessoaId: string | null;
    convocacaoId: string | null;
    observacaoTime: string | null;
    /** Só no voo: "também precisa de hotel". */
    precisaHotel?: boolean;
    /** Só no voo de Masterclass: a última palestra da turnê (a volta sai de lá). */
    eventoVoltaId?: string | null;
    /** Dia em que o pedido foi feito à SDC (AAAA-MM-DD). */
    dataSolicitacao: string;
    usuarioId: string;
    instante: Date;
  }): Promise<{ id: string; referencia: string }>;
  /** Grava "também precisa de hotel" no pedido de voo. */
  definirPrecisaHotel(pedidoId: string, precisaHotel: boolean, instante: Date): Promise<void>;
  /** Como está o hotel da pessoa no evento agora: origens de "precisa de hotel" e se ela ocupa um quarto. */
  hotelDaPessoaNoEvento(eventoId: string, pessoaId: string): Promise<{ origens: OrigemDoHotel[]; noQuarto: boolean }>;
  substituirTrechosDesejados(pedidoId: string, trechos: TrechoDesejado[], instante: Date): Promise<void>;
  travarPedido(pedidoId: string): Promise<PedidoTravado | null>;
  /**
   * Compare-and-set: só muda se a situação ainda for `de` (e, com `atualizadoEm`, se ninguém mexeu desde então).
   * false = outra pessoa mudou antes.
   */
  mudarPedido(
    pedidoId: string,
    condicao: { de: SituacaoDoPedido; atualizadoEm?: string },
    mudanca: {
      para: SituacaoDoPedido;
      instante: Date;
      observacaoTime?: string | null;
      emissao?: { valorCentavos: number; observacaoSdc: string | null; autor: AutorDoRetorno; formaPagamento?: string | null; /** Dia em que a SDC comprou (AAAA-MM-DD). */ dataCompra: string };
      cancelamento?: { usuarioId: string; motivo: string };
      /** A compra mudou: a aprovação do pagamento (se havia) deixa de valer. */
      aprovacaoCai?: boolean;
    },
  ): Promise<boolean>;
  /** Compare-and-set: aprova só se o pedido ainda está EMITIDO, sem aprovação, com o valor e a versão que o aprovador viu. */
  aprovarPagamento(pedidoId: string, visto: { valorCentavos: number; atualizadoEm: string }, aprovacao: { usuarioId: string; instante: Date; observacao: string | null }): Promise<boolean>;
  /** Compare-and-set: desfaz só se ainda está aprovado. */
  desfazerAprovacao(pedidoId: string, instante: Date): Promise<boolean>;
  registrarEmissaoDosTrechos(pedidoId: string, trechos: TrechoEmitido[], instante: Date): Promise<void>;
  /** Hospedagem travada, para pedir à SDC. `localTipo` nulo = hotel ainda não definido (a SDC escolhe). */
  travarHospedagemSemPedido(hospedagemId: string): Promise<{ eventoId: string; pedidoId: string | null; localTipo: string | null; quartos: number } | null>;
  vincularHospedagem(hospedagemId: string, pedidoId: string | null, instante: Date): Promise<void>;
  desvincularHospedagemDoPedido(pedidoId: string, instante: Date): Promise<void>;
  /** Tipo do local (HOTEL, APARTAMENTO, EVENTO). Nulo = não existe ou foi arquivado. */
  tipoDoLocal(localId: string): Promise<string | null>;
  /** Grava na hospedagem do pedido o hotel que a SDC reservou e o número da reserva. false = o pedido não tem hospedagem. */
  registrarReserva(pedidoId: string, reserva: { numeroReserva: string; localId: string }, instante: Date): Promise<boolean>;
  registrar(registro: RegistroDoPedido & AutorDoRetorno): Promise<void>;
};

const dataCurta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

/** O dia em que o pedido foi feito à SDC: o informado ou hoje; nunca no futuro. */
function dataDaSolicitacao(informada: string | undefined, instante: Date): string {
  const resultado = dataRealDoLancamento({ informada, hoje: dataEmSaoPaulo(instante) });
  if (!resultado.ok) throw new ErroDaLogistica("A data da solicitação não pode ser no futuro.");
  return resultado.data;
}

/** O dia em que a SDC comprou: o informado ou hoje; nunca no futuro nem antes da solicitação. */
function dataDaCompra(informada: string | undefined, pedido: PedidoTravado, instante: Date): string {
  const resultado = dataRealDoLancamento({ informada, hoje: dataEmSaoPaulo(instante), naoAntesDe: pedido.dataSolicitacao });
  if (resultado.ok) return resultado.data;
  throw new ErroDaLogistica(
    resultado.motivo === "FUTURA"
      ? "A data da compra não pode ser no futuro."
      : `A compra não pode ser antes da solicitação do pedido (${dataCurta(pedido.dataSolicitacao)}).${informada === undefined ? " Informe a data em que a compra foi feita." : ""}`,
  );
}

async function pedidoTravado(repo: RepositorioPedidos, pedidoId: string): Promise<PedidoTravado> {
  const pedido = await repo.travarPedido(pedidoId);
  if (!pedido) throw new ErroDaLogistica("Pedido não encontrado. Recarregue a página.");
  return pedido;
}

/**
 * Mexer na compra de um pedido com o pagamento aprovado: a SDC é recusada; com o time, a aprovação cai (e fica no
 * histórico). Devolve se a aprovação caiu, para o chamador gravar junto com a mudança.
 */
function aprovacaoAoMexer(pedido: PedidoTravado, quem: QuemMexeNaCompra): boolean {
  const efeito = efeitoNaAprovacao(pedido, quem);
  if (!efeito.permitido) throw new ErroDaLogistica(MENSAGEM_COMPRA_APROVADA);
  return efeito.aprovacaoCai;
}

/** No histórico: o time registra "em nome da SDC"; a SDC registra por ela mesma. `correcao` = já havia compra. */
function dadosDaAutoria(autor: AutorDoRetorno, pedido: PedidoTravado): Record<string, unknown> {
  return { ...(quemMexe(autor) === "TIME" ? { emNomeDe: "SDC" } : {}), ...(pedido.situacao === "EMITIDO" ? { correcao: true } : {}) };
}

async function registrarQuedaDaAprovacao(repo: RepositorioPedidos, pedido: PedidoTravado, autor: AutorDoRetorno, motivo: string): Promise<void> {
  await repo.registrar({ pedidoId: pedido.id, eventoId: pedido.eventoId, acao: "APROVACAO_DESFEITA", ...autor, dados: { motivo, valorCentavos: pedido.valorCentavos } });
}

function destinoDaAcao(pedido: PedidoTravado, acao: AcaoNoPedido): SituacaoDoPedido {
  const transicao = transicaoDoPedido(pedido.situacao, acao);
  if ("erro" in transicao) throw new ErroDaLogistica(mensagemDaTransicaoInvalida(pedido.situacao));
  return transicao.para;
}

/**
 * Pedido de voo como na planilha: evento + pessoa do staff. Não depende da escala (o voo é pedido até 3 meses antes,
 * em geral antes de a escala existir): a convocação é só um vínculo, preenchido quando a pessoa já está na escala.
 * A pessoa pode ter mais de um pedido ativo no evento (ida e volta + um trecho a mais), desde que quem registra
 * confirme que é outra compra.
 */
export async function registrarPedidoDeVoo(
  repo: RepositorioPedidos,
  entrada: RegistrarPedidoDeVoo,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<{ id: string; referencia: string; eventoId: string; outrosAtivos: string[]; precisaHotel: boolean }> {
  const evento = await repo.travarEvento(entrada.eventoId);
  if (!evento) throw new ErroDaLogistica("Evento não encontrado. Recarregue a página.");
  if (evento.cancelado) throw new ErroDaLogistica("Este evento foi cancelado: não dá para pedir voo para ele.");
  if (evento.dataFim < dataEmSaoPaulo(instante)) throw new ErroDaLogistica("Este evento já terminou: não dá para pedir voo para ele.");
  const pessoa = await repo.staffAtivo(entrada.pessoaId);
  if (!pessoa) throw new ErroDaLogistica("Esta pessoa não está ativa no cadastro de staff. Confira em Pessoas.");
  // Masterclass: a volta pode sair de outra palestra (a última da turnê). O pedido continua sendo da primeira.
  const eventoDaVolta = entrada.eventoVoltaId && entrada.eventoVoltaId !== evento.id ? await repo.eventoDoPedido(entrada.eventoVoltaId) : null;
  if (entrada.eventoVoltaId && entrada.eventoVoltaId !== evento.id && !eventoDaVolta) throw new ErroDaLogistica("Última palestra não encontrada. Recarregue a página.");
  const turne = validarTurne(evento, eventoDaVolta);
  if (!turne.ok) throw new ErroDaLogistica(mensagemDaRecusaDaTurne(turne.motivo));
  const dataSolicitacao = dataDaSolicitacao(entrada.dataSolicitacao, instante);

  const outrosAtivos = await repo.pedidosDeVooAtivos(evento.id, pessoa.pessoaId);
  if (outrosAtivos.length > 0 && !entrada.outraCompra) {
    throw new ErroDaLogistica(
      `${pessoa.nome} já tem ${outrosAtivos.length === 1 ? `o pedido ${outrosAtivos[0]}` : `os pedidos ${outrosAtivos.join(", ")}`} para este evento. ` +
        "Se for uma compra a mais (um trecho extra, por exemplo), marque \"É outra compra para a mesma pessoa\" e registre de novo.",
    );
  }

  const pedido = await repo.inserirPedido({
    tipo: "VOO",
    eventoId: evento.id,
    pessoaId: pessoa.pessoaId,
    convocacaoId: await repo.convocacaoPrincipal(evento.id, pessoa.pessoaId),
    observacaoTime: entrada.observacaoTime ?? null,
    precisaHotel: entrada.precisaHotel === true,
    eventoVoltaId: turne.eventoVoltaId,
    dataSolicitacao,
    usuarioId,
    instante,
  });
  await repo.substituirTrechosDesejados(pedido.id, entrada.trechos.map(trechoDesejado), instante);
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: evento.id,
    acao: "PEDIDO_REGISTRADO",
    statusPara: "PEDIDO",
    usuarioId,
    dados: {
      referencia: pedido.referencia,
      tipo: "VOO",
      trechos: entrada.trechos.map((trecho) => trecho.sentido),
      ...(entrada.precisaHotel === true ? { precisaHotel: true } : {}),
      ...(turne.eventoVoltaId ? { eventoVoltaId: turne.eventoVoltaId } : {}),
      dataSolicitacao,
      ...(outrosAtivos.length > 0 ? { outrosAtivos } : {}),
    },
  });
  return { ...pedido, eventoId: evento.id, outrosAtivos, precisaHotel: entrada.precisaHotel === true };
}

function trechoDesejado(trecho: RegistrarPedidoDeVoo["trechos"][number]): TrechoDesejado {
  return {
    sentido: trecho.sentido,
    origemIata: trecho.origemIata,
    destinoIata: trecho.destinoIata,
    dataDesejada: trecho.dataDesejada,
    preferenciaHorario: trecho.preferenciaHorario ?? null,
  };
}

/**
 * "Também precisa de hotel" num pedido de voo que já existe. Marcar põe a pessoa na lista de quem precisa de hotel do
 * evento. Desmarcar tira esta origem: se a pessoa também está na lista pela escala, por outro pedido de voo ou porque
 * foi acrescentada na Hospedagem, continua nela (e no quarto); se era a única origem e ela está num quarto, é recusado.
 */
export async function definirHotelDoVoo(
  repo: RepositorioPedidos,
  entrada: { pedidoId: string; precisaHotel: boolean },
  { usuarioId, instante }: ContextoDaAcao,
): Promise<PedidoTravado & { continuaNaLista: boolean }> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  if (pedido.tipo !== "VOO" || !pedido.pessoaId) throw new ErroDaLogistica("Só o pedido de voo diz se a pessoa também precisa de hotel.");
  if (pedido.situacao === "CANCELADO") throw new ErroDaLogistica("Este pedido foi cancelado: não dá para mudar o hotel por ele.");
  if (pedido.precisaHotel === entrada.precisaHotel) {
    throw new ErroDaLogistica(entrada.precisaHotel ? "Este pedido já está marcado com hotel. Recarregue a página." : "Este pedido já está sem hotel. Recarregue a página.");
  }

  await repo.definirPrecisaHotel(pedido.id, entrada.precisaHotel, instante);
  // Lido depois de gravar: outro pedido de voo da mesma pessoa no evento continua valendo como origem.
  const hotel = await repo.hotelDaPessoaNoEvento(pedido.eventoId, pedido.pessoaId);
  if (!entrada.precisaHotel && hotel.noQuarto && hotel.origens.length === 0) {
    throw new ErroDaLogistica("Esta pessoa já está num quarto. Tire a pessoa do quarto em Hospedagem antes de desmarcar o hotel.");
  }
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: entrada.precisaHotel ? "HOTEL_MARCADO" : "HOTEL_DESMARCADO",
    usuarioId,
    dados: { referencia: pedido.referencia, origens: hotel.origens },
  });
  return { ...pedido, precisaHotel: entrada.precisaHotel, continuaNaLista: hotel.origens.length > 0 };
}

export async function alterarPedido(repo: RepositorioPedidos, entrada: AlterarPedido, { usuarioId, instante }: ContextoDaAcao): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  const para = destinoDaAcao(pedido, "ALTERAR");
  if (entrada.trechos && pedido.tipo !== "VOO") throw new ErroDaLogistica("Pedido de hospedagem não tem trechos de voo.");
  const aprovacaoCai = aprovacaoAoMexer(pedido, "TIME");

  const mudou = await repo.mudarPedido(
    pedido.id,
    { de: pedido.situacao, atualizadoEm: entrada.atualizadoEm },
    { para, instante, observacaoTime: entrada.observacaoTime ?? null, aprovacaoCai },
  );
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  if (aprovacaoCai) await registrarQuedaDaAprovacao(repo, pedido, { usuarioId }, "pedido alterado");
  if (entrada.trechos) await repo.substituirTrechosDesejados(pedido.id, entrada.trechos.map(trechoDesejado), instante);

  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "ALTERADO",
    statusDe: pedido.situacao,
    statusPara: para,
    usuarioId,
    dados: entrada.trechos ? { trechos: entrada.trechos.map((trecho) => trecho.sentido) } : {},
  });
  return { ...pedido, situacao: para };
}

export async function cancelarPedido(repo: RepositorioPedidos, entrada: CancelarPedido, { usuarioId, instante }: ContextoDaAcao): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  const para = destinoDaAcao(pedido, "CANCELAR");
  const aprovacaoCai = aprovacaoAoMexer(pedido, "TIME");
  const mudou = await repo.mudarPedido(pedido.id, { de: pedido.situacao }, { para, instante, cancelamento: { usuarioId, motivo: entrada.motivo }, aprovacaoCai });
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  if (aprovacaoCai) await registrarQuedaDaAprovacao(repo, pedido, { usuarioId }, "pedido cancelado");
  // A hospedagem fica sem pedido para poder pedir de novo; o pedido cancelado continua na lista da SDC.
  if (pedido.tipo === "HOSPEDAGEM") await repo.desvincularHospedagemDoPedido(pedido.id, instante);

  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "CANCELADO",
    statusDe: pedido.situacao,
    statusPara: para,
    // O motivo fica só em pedido_sdc.motivo_cancelamento (texto livre fora do histórico imutável, docs/09 §7.1).
    dados: { temMotivo: Boolean(entrada.motivo) },
    usuarioId,
  });
  return { ...pedido, situacao: para };
}

/**
 * A compra do voo: lançada pela própria SDC (área dela) ou pelo time em nome dela (selo "Registrado pelo time").
 * Vale também para corrigir uma compra já registrada; com o pagamento aprovado, a SDC é recusada e, com o time, a
 * aprovação cai. As validações são as mesmas para os dois.
 */
export async function registrarRetornoDeVoo(
  repo: RepositorioPedidos,
  entrada: Omit<RegistrarRetornoDeVoo, "trechos"> & { trechos: (Omit<RegistrarRetornoDeVoo["trechos"][number], "cartaoEmbarqueUrl"> & { cartaoEmbarqueUrl?: string })[] },
  { autor, instante }: ContextoDoRetorno,
): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  if (pedido.tipo !== "VOO") throw new ErroDaLogistica("Este pedido é de hospedagem: registre o número da reserva.");
  const para = destinoDaAcao(pedido, "REGISTRAR_RETORNO");
  const aprovacaoCai = aprovacaoAoMexer(pedido, quemMexe(autor));

  const informados = new Set(entrada.trechos.map((trecho) => trecho.sentido));
  const faltando = pedido.sentidos.filter((sentido) => !informados.has(sentido));
  if (faltando.length > 0) throw new ErroDaLogistica(`Informe o voo de ${faltando.map((sentido) => (sentido === "IDA" ? "ida" : "volta")).join(" e de ")}.`);
  const sobrando = entrada.trechos.filter((trecho) => !pedido.sentidos.includes(trecho.sentido));
  if (sobrando.length > 0) throw new ErroDaLogistica("O pedido não tem esse trecho. Altere o pedido antes de registrar o voo.");
  const dataCompra = dataDaCompra(entrada.dataCompra, pedido, instante);

  const mudou = await repo.mudarPedido(
    pedido.id,
    { de: pedido.situacao },
    { para, instante, emissao: { valorCentavos: entrada.valorCentavos, observacaoSdc: entrada.observacaoSdc ?? null, autor, formaPagamento: entrada.formaPagamento ?? null, dataCompra }, aprovacaoCai },
  );
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  if (aprovacaoCai) await registrarQuedaDaAprovacao(repo, pedido, autor, "compra corrigida");
  await repo.registrarEmissaoDosTrechos(
    pedido.id,
    entrada.trechos.map((trecho) => ({
      sentido: trecho.sentido,
      companhia: trecho.companhia,
      numeroVoo: trecho.numeroVoo,
      localizador: trecho.localizador,
      partidaEm: instanteDeSaoPaulo(trecho.partidaEm),
      chegadaEm: instanteDeSaoPaulo(trecho.chegadaEm),
      // O link do cartão de embarque é só do time: quando quem registra é a SDC, a coluna fica como estava.
      ...(quemMexe(autor) === "TIME" ? { cartaoEmbarqueUrl: trecho.cartaoEmbarqueUrl ?? null } : {}),
    })),
    instante,
  );
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "RETORNO_REGISTRADO",
    statusDe: pedido.situacao,
    statusPara: para,
    ...autor,
    // Localizador e número da reserva ficam no trecho/hospedagem; o histórico imutável só diz que houve (docs/09 §7.1).
    dados: {
      ...dadosDaAutoria(autor, pedido),
      valorCentavos: entrada.valorCentavos,
      trechos: entrada.trechos.length,
      temLocalizador: entrada.trechos.some((trecho) => Boolean(trecho.localizador)),
      dataCompra,
      ...(entrada.formaPagamento ? { formaPagamento: entrada.formaPagamento } : {}),
    },
  });
  return { ...pedido, situacao: para };
}

export async function registrarPedidoDeHospedagem(
  repo: RepositorioPedidos,
  entrada: RegistrarPedidoDeHospedagem,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<{ id: string; referencia: string; eventoId: string }> {
  const hospedagem = await repo.travarHospedagemSemPedido(entrada.hospedagemId);
  if (!hospedagem) throw new ErroDaLogistica("Hospedagem não encontrada. Recarregue a página.");
  if (hospedagem.pedidoId) throw new ErroDaLogistica("Esta hospedagem já tem pedido à SDC.");
  if (hospedagem.localTipo === "APARTAMENTO") throw new ErroDaLogistica("Apartamento da IAM não passa pela SDC.");
  // O pedido diz à SDC quantos quartos e quem divide com quem: sem quarto não há o que pedir.
  if (hospedagem.quartos === 0) throw new ErroDaLogistica("Monte os quartos antes de pedir a hospedagem à SDC.");
  const dataSolicitacao = dataDaSolicitacao(entrada.dataSolicitacao, instante);

  const pedido = await repo.inserirPedido({
    tipo: "HOSPEDAGEM",
    eventoId: hospedagem.eventoId,
    pessoaId: null,
    convocacaoId: null,
    observacaoTime: entrada.observacaoTime ?? null,
    dataSolicitacao,
    usuarioId,
    instante,
  });
  await repo.vincularHospedagem(entrada.hospedagemId, pedido.id, instante);
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: hospedagem.eventoId,
    acao: "PEDIDO_REGISTRADO",
    statusPara: "PEDIDO",
    usuarioId,
    dados: { referencia: pedido.referencia, tipo: "HOSPEDAGEM", hospedagemId: entrada.hospedagemId, dataSolicitacao },
  });
  return { ...pedido, eventoId: hospedagem.eventoId };
}

/**
 * Retorno da SDC para a hospedagem: é aqui que o hotel entra (quem escolhe e reserva é a SDC), com o número da
 * reserva, o valor total e a forma de pagamento. `localId` já vem resolvido pelo fluxo (hotel cadastrado ou criado na hora).
 */
export async function registrarRetornoDeHospedagem(
  repo: RepositorioPedidos,
  entrada: Omit<RegistrarRetornoDeHospedagem, "localId" | "novoHotel"> & { localId: string },
  { autor, instante }: ContextoDoRetorno,
): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  if (pedido.tipo !== "HOSPEDAGEM") throw new ErroDaLogistica("Este pedido é de voo: registre os dados do voo.");
  const para = destinoDaAcao(pedido, "REGISTRAR_RETORNO");
  const aprovacaoCai = aprovacaoAoMexer(pedido, quemMexe(autor));
  const tipoDoLocal = await repo.tipoDoLocal(entrada.localId);
  if (tipoDoLocal === null) throw new ErroDaLogistica("Hotel não encontrado. Escolha outro ou cadastre o hotel que a SDC reservou.");
  if (tipoDoLocal !== "HOTEL") throw new ErroDaLogistica("Escolha um hotel: a SDC não reserva apartamento da IAM nem local de evento.");
  const dataCompra = dataDaCompra(entrada.dataCompra, pedido, instante);
  const mudou = await repo.mudarPedido(
    pedido.id,
    { de: pedido.situacao },
    { para, instante, emissao: { valorCentavos: entrada.valorCentavos, observacaoSdc: entrada.observacaoSdc ?? null, autor, formaPagamento: entrada.formaPagamento, dataCompra }, aprovacaoCai },
  );
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  if (aprovacaoCai) await registrarQuedaDaAprovacao(repo, pedido, autor, "compra corrigida");
  if (!(await repo.registrarReserva(pedido.id, { numeroReserva: entrada.numeroReserva, localId: entrada.localId }, instante))) {
    throw new LogisticaMudouError(`o pedido ${pedido.referencia} ficou sem hospedagem`);
  }
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "RETORNO_REGISTRADO",
    statusDe: pedido.situacao,
    statusPara: para,
    ...autor,
    dados: { ...dadosDaAutoria(autor, pedido), valorCentavos: entrada.valorCentavos, temNumeroReserva: Boolean(entrada.numeroReserva), localId: entrada.localId, formaPagamento: entrada.formaPagamento, dataCompra },
  });
  return { ...pedido, situacao: para };
}

/**
 * O time confere a compra e aprova o pagamento: "usamos e este valor pode ser pago". Só com a compra registrada e com
 * valor; pedido cancelado não se aprova. A observação é do time (pode ir para o histórico).
 */
export async function aprovarPagamento(
  repo: RepositorioPedidos,
  entrada: { pedidoId: string; valorCentavos: number; atualizadoEm: string; observacao?: string },
  { usuarioId, instante }: ContextoDaAcao,
): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  const verificacao = podeAprovarPagamento(pedido);
  if (!verificacao.ok) throw new ErroDaLogistica(mensagemDaRecusaDaAprovacao(verificacao.motivo));
  // A aprovação vale para o que o aprovador viu: mesmo valor e mesma versão do pedido (a SDC pode ter corrigido a
  // compra entre a tela abrir e o clique). O compare-and-set confere os dois de novo na gravação.
  const visto = { valorCentavos: entrada.valorCentavos, atualizadoEm: entrada.atualizadoEm };
  if (!aprovacaoValeParaACompra(pedido, visto) || !(await repo.aprovarPagamento(pedido.id, visto, { usuarioId, instante, observacao: entrada.observacao ?? null }))) {
    throw new ErroDaLogistica(MENSAGEM_COMPRA_MUDOU);
  }
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "PAGAMENTO_APROVADO",
    comentario: entrada.observacao ?? null,
    usuarioId,
    dados: { referencia: pedido.referencia, tipo: pedido.tipo, valorCentavos: pedido.valorCentavos },
  });
  return { ...pedido, aprovadoEm: instante };
}

/** O time desfaz a aprovação (para a SDC corrigir a compra, por exemplo). O pedido volta para "a aprovar". */
export async function desfazerAprovacao(repo: RepositorioPedidos, entrada: { pedidoId: string }, { usuarioId, instante }: ContextoDaAcao): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  if (!podeDesfazerAprovacao(pedido)) throw new ErroDaLogistica("Este pagamento não está aprovado. Recarregue a página.");
  if (!(await repo.desfazerAprovacao(pedido.id, instante))) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  await registrarQuedaDaAprovacao(repo, pedido, { usuarioId }, "desfeita pelo time");
  return { ...pedido, aprovadoEm: null };
}
