import { ErroDaLogistica, LogisticaMudouError } from "../domain/erros";
import {
  type AcaoNoPedido,
  mensagemDaTransicaoInvalida,
  type SituacaoDoPedido,
  type TipoDoPedido,
  type TrechoDesejado,
  transicaoDoPedido,
} from "../domain/pedido";
import { instanteDeSaoPaulo } from "../domain/datas";
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

export type ConvocacaoTravada = { convocacaoId: string; pessoaId: string; eventoId: string; ativa: boolean; deslocamento: string | null };

export type PedidoTravado = {
  id: string;
  referencia: string;
  tipo: TipoDoPedido;
  situacao: SituacaoDoPedido;
  eventoId: string;
  pessoaId: string | null;
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
  cartaoEmbarqueUrl: string | null;
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
  travarConvocacao(convocacaoId: string): Promise<ConvocacaoTravada | null>;
  pedidoDeVooAtivo(eventoId: string, pessoaId: string): Promise<string | null>;
  inserirPedido(pedido: {
    tipo: TipoDoPedido;
    eventoId: string;
    pessoaId: string | null;
    convocacaoId: string | null;
    observacaoTime: string | null;
    usuarioId: string;
    instante: Date;
  }): Promise<{ id: string; referencia: string }>;
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
      emissao?: { valorCentavos: number; observacaoSdc: string | null; usuarioId: string };
      cancelamento?: { usuarioId: string; motivo: string };
    },
  ): Promise<boolean>;
  registrarEmissaoDosTrechos(pedidoId: string, trechos: TrechoEmitido[], instante: Date): Promise<void>;
  /** Hospedagem do evento ainda sem pedido, travada. */
  travarHospedagemSemPedido(hospedagemId: string): Promise<{ eventoId: string; pedidoId: string | null; localTipo: string } | null>;
  vincularHospedagem(hospedagemId: string, pedidoId: string | null, instante: Date): Promise<void>;
  desvincularHospedagemDoPedido(pedidoId: string, instante: Date): Promise<void>;
  registrarReserva(pedidoId: string, numeroReserva: string, instante: Date): Promise<void>;
  registrar(registro: RegistroDoPedido & { usuarioId: string }): Promise<void>;
};

async function pedidoTravado(repo: RepositorioPedidos, pedidoId: string): Promise<PedidoTravado> {
  const pedido = await repo.travarPedido(pedidoId);
  if (!pedido) throw new ErroDaLogistica("Pedido não encontrado. Recarregue a página.");
  return pedido;
}

function destinoDaAcao(pedido: PedidoTravado, acao: AcaoNoPedido): SituacaoDoPedido {
  const transicao = transicaoDoPedido(pedido.situacao, acao);
  if ("erro" in transicao) throw new ErroDaLogistica(mensagemDaTransicaoInvalida(pedido.situacao, acao));
  return transicao.para;
}

export async function registrarPedidoDeVoo(
  repo: RepositorioPedidos,
  entrada: RegistrarPedidoDeVoo,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<{ id: string; referencia: string; eventoId: string }> {
  const convocacao = await repo.travarConvocacao(entrada.convocacaoId);
  if (!convocacao) throw new ErroDaLogistica("A pessoa não está mais nesta escala. Recarregue a página.");
  if (!convocacao.ativa) throw new ErroDaLogistica("A pessoa saiu da escala deste evento: não dá para pedir voo.");
  if (convocacao.deslocamento !== "VOO") throw new ErroDaLogistica("O deslocamento desta pessoa não é Avião. Mude o deslocamento para Avião na escala.");

  const existente = await repo.pedidoDeVooAtivo(convocacao.eventoId, convocacao.pessoaId);
  if (existente) throw new ErroDaLogistica(`Esta pessoa já tem o pedido ${existente} para este evento. Altere esse pedido.`);

  const pedido = await repo.inserirPedido({
    tipo: "VOO",
    eventoId: convocacao.eventoId,
    pessoaId: convocacao.pessoaId,
    convocacaoId: convocacao.convocacaoId,
    observacaoTime: entrada.observacaoTime ?? null,
    usuarioId,
    instante,
  });
  await repo.substituirTrechosDesejados(pedido.id, entrada.trechos.map(trechoDesejado), instante);
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: convocacao.eventoId,
    acao: "PEDIDO_REGISTRADO",
    statusPara: "PEDIDO",
    usuarioId,
    dados: { referencia: pedido.referencia, tipo: "VOO", trechos: entrada.trechos.map((trecho) => trecho.sentido) },
  });
  return { ...pedido, eventoId: convocacao.eventoId };
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

export async function alterarPedido(repo: RepositorioPedidos, entrada: AlterarPedido, { usuarioId, instante }: ContextoDaAcao): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  const para = destinoDaAcao(pedido, "ALTERAR");
  if (entrada.trechos && pedido.tipo !== "VOO") throw new ErroDaLogistica("Pedido de hospedagem não tem trechos de voo.");

  const mudou = await repo.mudarPedido(
    pedido.id,
    { de: pedido.situacao, atualizadoEm: entrada.atualizadoEm },
    { para, instante, observacaoTime: entrada.observacaoTime ?? null },
  );
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
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
  const mudou = await repo.mudarPedido(pedido.id, { de: pedido.situacao }, { para, instante, cancelamento: { usuarioId, motivo: entrada.motivo } });
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
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

/** Voo emitido informado pela SDC e lançado pelo time (selo "Registrado pelo time" em retorno_registrado_por). */
export async function registrarRetornoDeVoo(
  repo: RepositorioPedidos,
  entrada: RegistrarRetornoDeVoo,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  if (pedido.tipo !== "VOO") throw new ErroDaLogistica("Este pedido é de hospedagem: registre o número da reserva.");
  const para = destinoDaAcao(pedido, "REGISTRAR_RETORNO");

  const informados = new Set(entrada.trechos.map((trecho) => trecho.sentido));
  const faltando = pedido.sentidos.filter((sentido) => !informados.has(sentido));
  if (faltando.length > 0) throw new ErroDaLogistica(`Informe o voo de ${faltando.map((sentido) => (sentido === "IDA" ? "ida" : "volta")).join(" e de ")}.`);
  const sobrando = entrada.trechos.filter((trecho) => !pedido.sentidos.includes(trecho.sentido));
  if (sobrando.length > 0) throw new ErroDaLogistica("O pedido não tem esse trecho. Altere o pedido antes de registrar o voo.");

  const mudou = await repo.mudarPedido(
    pedido.id,
    { de: pedido.situacao },
    { para, instante, emissao: { valorCentavos: entrada.valorCentavos, observacaoSdc: entrada.observacaoSdc ?? null, usuarioId } },
  );
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  await repo.registrarEmissaoDosTrechos(
    pedido.id,
    entrada.trechos.map((trecho) => ({
      sentido: trecho.sentido,
      companhia: trecho.companhia,
      numeroVoo: trecho.numeroVoo,
      localizador: trecho.localizador,
      partidaEm: instanteDeSaoPaulo(trecho.partidaEm),
      chegadaEm: instanteDeSaoPaulo(trecho.chegadaEm),
      cartaoEmbarqueUrl: trecho.cartaoEmbarqueUrl ?? null,
    })),
    instante,
  );
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "RETORNO_REGISTRADO",
    statusDe: pedido.situacao,
    statusPara: para,
    usuarioId,
    // Localizador e número da reserva ficam no trecho/hospedagem; o histórico imutável só diz que houve (docs/09 §7.1).
    dados: { emNomeDe: "SDC", valorCentavos: entrada.valorCentavos, trechos: entrada.trechos.length, temLocalizador: entrada.trechos.some((trecho) => Boolean(trecho.localizador)) },
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
  if (hospedagem.localTipo !== "HOTEL") throw new ErroDaLogistica("Apartamento da IAM não passa pela SDC.");

  const pedido = await repo.inserirPedido({
    tipo: "HOSPEDAGEM",
    eventoId: hospedagem.eventoId,
    pessoaId: null,
    convocacaoId: null,
    observacaoTime: entrada.observacaoTime ?? null,
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
    dados: { referencia: pedido.referencia, tipo: "HOSPEDAGEM", hospedagemId: entrada.hospedagemId },
  });
  return { ...pedido, eventoId: hospedagem.eventoId };
}

export async function registrarRetornoDeHospedagem(
  repo: RepositorioPedidos,
  entrada: RegistrarRetornoDeHospedagem,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<PedidoTravado> {
  const pedido = await pedidoTravado(repo, entrada.pedidoId);
  if (pedido.tipo !== "HOSPEDAGEM") throw new ErroDaLogistica("Este pedido é de voo: registre os dados do voo.");
  const para = destinoDaAcao(pedido, "REGISTRAR_RETORNO");
  const mudou = await repo.mudarPedido(
    pedido.id,
    { de: pedido.situacao },
    { para, instante, emissao: { valorCentavos: entrada.valorCentavos, observacaoSdc: entrada.observacaoSdc ?? null, usuarioId } },
  );
  if (!mudou) throw new LogisticaMudouError(`o pedido ${pedido.referencia} mudou`);
  await repo.registrarReserva(pedido.id, entrada.numeroReserva, instante);
  await repo.registrar({
    pedidoId: pedido.id,
    eventoId: pedido.eventoId,
    acao: "RETORNO_REGISTRADO",
    statusDe: pedido.situacao,
    statusPara: para,
    usuarioId,
    dados: { emNomeDe: "SDC", valorCentavos: entrada.valorCentavos, temNumeroReserva: Boolean(entrada.numeroReserva) },
  });
  return { ...pedido, situacao: para };
}
