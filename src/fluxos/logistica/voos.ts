import { type AtorSdcDaEscrita, bancoParaLeitura, type Executor, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import { ehMasterclass } from "@/modules/eventos";
import {
  agruparPorMesEEvento,
  type AlterarPedido,
  type AprovarPagamento,
  type CancelarPedido,
  criarRepositorioPedidos,
  dataEmSaoPaulo,
  type DefinirHotelDoVoo,
  diasDoAtraso,
  type EventoDaLogistica,
  type EventoSemPedidoDeVoo,
  eventoDeCasa,
  eventosSemPedidoDeVoo,
  type GrupoDoMes,
  type JanelaDeCompra,
  janelaDeCompra,
  manterNoQuartoSemOrigem,
  type PedidoDaSdc,
  pedidoAtivo,
  type RegistrarPedidoDeVoo,
  type RegistrarRetornoDeVoo,
  servicoDePedidos,
  type SituacaoDoVoo,
  textoDoPedidoDeVoo,
  type TotaisDoPagamento,
  totaisDoPagamento,
  type Trajeto,
  trajetoDosTrechos,
} from "@/modules/logistica";

import { diasDoAvisoDeVoos } from "./aviso";
import { traduzirErros } from "./comum";
import { desfazerDispensa } from "./dispensa";

// Voos como na planilha do time: nós solicitamos, a SDC compra, o time registra o retorno. O pedido é da pessoa no
// evento e não depende da escala (o voo é pedido até 3 meses antes, em geral antes de a escala existir).

export type LinhaDeVoo = {
  chave: string;
  situacao: SituacaoDoVoo;
  evento: EventoDaLogistica;
  /** `naEscala`: a pessoa está na escala do evento (a coluna "Escala" da planilha). O pedido vale sem isso. */
  passageiro: { pessoaId: string | null; nome: string; naEscala: boolean };
  janela: { janela: JanelaDeCompra; dias: number };
  /** Nulo = lembrete da escala: a pessoa está marcada como Avião e ainda não tem pedido ("A pedir"). */
  pedido: PedidoDaSdc | null;
};

export type FiltroDeVoos = { eventoId?: string; situacao?: SituacaoDoVoo };

export type AvisoDeVoosPorEvento = { diasDoAviso: number; diasDoAtraso: number; eventos: EventoSemPedidoDeVoo[] };

export type VoosCarregados = {
  /** Eventos de hoje em diante, com ou sem escala: o filtro da tela e o evento do "Novo pedido". */
  eventos: EventoDaLogistica[];
  /** O evento do filtro (ou o da aba Logística do evento), mesmo que já tenha passado. */
  eventoDoFiltro: EventoDaLogistica | null;
  /** Mês → evento → linhas (uma por compra), na ordem da planilha. Já com o filtro de situação. */
  grupos: GrupoDoMes<EventoDaLogistica, LinhaDeVoo>[];
  /** Linhas depois do filtro de situação. */
  total: number;
  contagens: Record<SituacaoDoVoo, number>;
  /** Soma das compras dos pedidos listados (antes do filtro de situação): a aprovar pelo time e já aprovadas. */
  totais: TotaisDoPagamento;
  /** Aviso por evento: entrou no prazo (Configurações › Aviso de voos) e ainda não tem nenhum pedido de voo. */
  avisoDeCompra: AvisoDeVoosPorEvento;
  /** Eventos que o time marcou como "não precisa de voo" (para desfazer). */
  semVoo: EventoDaLogistica[];
  /**
   * Eventos com gente que precisa de hotel pelo pedido de voo e ainda está sem quarto: o atalho para montar os quartos
   * na Hospedagem (o hotel é pedido junto com o voo, antes da escala).
   */
  hotelSemQuarto: { evento: EventoDaLogistica; pessoas: number }[];
  /** Quem pode receber um pedido: pessoas ativas do cadastro de staff. */
  staff: { pessoaId: string; nome: string }[];
  /** Pedidos ativos, para o formulário avisar antes de registrar outro da mesma pessoa no mesmo evento. */
  pedidosAtivos: { eventoId: string; pessoaId: string; referencia: string; trajeto: Trajeto | null }[];
};

const SITUACOES: SituacaoDoVoo[] = ["A_PEDIR", "PEDIDO", "EMITIDO", "ALTERADO", "CANCELADO"];

const par = (eventoId: string, pessoaId: string | null) => `${eventoId}|${pessoaId}`;

/**
 * Aviso por evento (Início e topo de Voos): evento no prazo, fora as Masterclasses, sem nenhum pedido de voo e que o
 * time não marcou como "não precisa de voo". Quem está marcado como Avião na escala entra só como lembrete.
 */
export async function avisoDeVoosPorEvento(db: Executor, hoje: string, filtro: { eventoId?: string } = {}): Promise<AvisoDeVoosPorEvento> {
  const repo = criarRepositorioPedidos(db);
  const [futuros, pedidos, passageiros, diasDoAviso] = await Promise.all([
    repo.eventosFuturos({ desde: hoje }),
    repo.pedidos({ desde: hoje, eventoId: filtro.eventoId, tipo: "VOO" }),
    repo.passageirosDeVoo({ desde: hoje, eventoId: filtro.eventoId }),
    diasDoAvisoDeVoos(db),
  ]);
  return montarAviso({ futuros, pedidos, passageiros, diasDoAviso, hoje, eventoId: filtro.eventoId });
}

function montarAviso({
  futuros,
  pedidos,
  passageiros,
  diasDoAviso,
  hoje,
  eventoId,
}: {
  futuros: (EventoDaLogistica & { tipoSigla: string | null; poloCodigo: string | null })[];
  pedidos: PedidoDaSdc[];
  passageiros: { evento: { id: string } }[];
  diasDoAviso: number;
  hoje: string;
  eventoId?: string;
}): AvisoDeVoosPorEvento {
  const comPedidoAtivo = new Set(pedidos.filter((pedido) => pedido.tipo === "VOO" && pedidoAtivo(pedido.situacao)).map((pedido) => pedido.evento.id));
  const marcadasComoAviao = new Map<string, number>();
  for (const { evento } of passageiros) marcadasComoAviao.set(evento.id, (marcadasComoAviao.get(evento.id) ?? 0) + 1);
  // Fora do aviso: Masterclasses e os eventos do polo de casa (a equipe é de lá). O pedido continua liberado para eles.
  const candidatos = futuros.filter((evento) => !ehMasterclass({ tipoSigla: evento.tipoSigla ?? "" }) && !eventoDeCasa(evento.poloCodigo) && (!eventoId || evento.id === eventoId));
  return { diasDoAviso, diasDoAtraso: diasDoAtraso(diasDoAviso), eventos: eventosSemPedidoDeVoo(candidatos, comPedidoAtivo, marcadasComoAviao, hoje, diasDoAviso) };
}

/** Voos: pedidos à SDC agrupados por mês e evento (do dia em diante, ou os do evento do filtro) e os lembretes da escala. */
export async function carregarVoos(filtro: FiltroDeVoos, agora: Date): Promise<VoosCarregados> {
  const hoje = dataEmSaoPaulo(agora);
  const db = await bancoParaLeitura();
  const repo = criarRepositorioPedidos(db);
  const [futuros, passageiros, doPeriodo, esperandoAprovacao, naEscala, staff, diasDoAviso, semQuartoPeloVoo] = await Promise.all([
    repo.eventosFuturos({ desde: hoje }),
    repo.passageirosDeVoo({ desde: hoje, eventoId: filtro.eventoId }),
    repo.pedidos({ desde: hoje, eventoId: filtro.eventoId, tipo: "VOO" }),
    // A aprovação vem depois do evento (o time confirma que usou): compras a aprovar de eventos que já passaram
    // continuam na lista até serem aprovadas.
    filtro.eventoId ? Promise.resolve([]) : repo.pedidos({ tipo: "VOO", aAprovar: true }),
    repo.naEscala({ desde: hoje, eventoId: filtro.eventoId }),
    repo.staffAtivoPorNome(),
    diasDoAvisoDeVoos(db),
    repo.comHotelPeloVooSemQuarto({ desde: hoje, eventoId: filtro.eventoId }),
  ]);
  const jaListados = new Set(doPeriodo.map((pedido) => pedido.id));
  const pedidos = [...esperandoAprovacao.filter((pedido) => !jaListados.has(pedido.id)), ...doPeriodo];
  const eventoDoFiltro = filtro.eventoId ? (futuros.find((evento) => evento.id === filtro.eventoId) ?? (await repo.eventoPorId(filtro.eventoId))) : null;

  const ativos = pedidos.filter((pedido) => pedidoAtivo(pedido.situacao));
  const comPedidoAtivo = new Set(ativos.map((pedido) => par(pedido.evento.id, pedido.pessoaId)));
  const linhas: LinhaDeVoo[] = [
    ...pedidos.map((pedido) => ({
      chave: pedido.id,
      situacao: pedido.situacao,
      evento: pedido.evento,
      passageiro: { pessoaId: pedido.pessoaId, nome: pedido.pessoaNome ?? "—", naEscala: naEscala.has(par(pedido.evento.id, pedido.pessoaId)) },
      janela: janelaDeCompra(pedido.evento.dataInicio, hoje, diasDoAviso),
      pedido,
    })),
    // Lembrete: está na escala como Avião e ainda não tem pedido. É um atalho, não a porta de entrada do pedido.
    ...passageiros
      .filter((passageiro) => !comPedidoAtivo.has(par(passageiro.evento.id, passageiro.pessoaId)))
      .map((passageiro) => ({
        chave: `a-pedir-${passageiro.convocacaoId}`,
        situacao: "A_PEDIR" as const,
        evento: passageiro.evento,
        passageiro: { pessoaId: passageiro.pessoaId, nome: passageiro.pessoaNome, naEscala: true },
        janela: janelaDeCompra(passageiro.evento.dataInicio, hoje, diasDoAviso),
        pedido: null,
      })),
  ];
  // Dentro do evento: por passageiro (as compras da mesma pessoa ficam juntas, a mais antiga primeiro); lembretes no fim.
  linhas.sort(
    (a, b) =>
      Number(a.pedido === null) - Number(b.pedido === null) ||
      a.passageiro.nome.localeCompare(b.passageiro.nome, "pt-BR") ||
      (a.pedido?.referencia ?? "").localeCompare(b.pedido?.referencia ?? ""),
  );
  const contagens = Object.fromEntries(SITUACOES.map((situacao) => [situacao, linhas.filter((linha) => linha.situacao === situacao).length])) as Record<SituacaoDoVoo, number>;
  const filtradas = filtro.situacao ? linhas.filter((linha) => linha.situacao === filtro.situacao) : linhas;

  return {
    eventos: futuros,
    eventoDoFiltro,
    grupos: agruparPorMesEEvento(filtradas),
    total: filtradas.length,
    contagens,
    totais: totaisDoPagamento(pedidos),
    avisoDeCompra: montarAviso({ futuros, pedidos, passageiros, diasDoAviso, hoje, eventoId: filtro.eventoId }),
    semVoo: futuros.filter((evento) => evento.semVoo && (!filtro.eventoId || evento.id === filtro.eventoId)),
    hotelSemQuarto: semQuartoPeloVoo.flatMap(({ eventoId, pessoas }) => {
      const evento = futuros.find((item) => item.id === eventoId);
      return evento ? [{ evento, pessoas }] : [];
    }),
    staff,
    pedidosAtivos: [...ativos].sort((a, b) => a.referencia.localeCompare(b.referencia)).flatMap((pedido) =>
      pedido.pessoaId
        ? [{ eventoId: pedido.evento.id, pessoaId: pedido.pessoaId, referencia: pedido.referencia, trajeto: trajetoDosTrechos(pedido.trechos.map((trecho) => trecho.sentido)) }]
        : [],
    ),
  };
}

export type PedidoCarregado = PedidoDaSdc & { textoParaSdc: string | null };

/** Painel do pedido (?ref=SDC-…). Nulo = referência inexistente. */
export async function carregarPedido(referencia: string): Promise<PedidoCarregado | null> {
  if (!/^SDC-\d{6,}$/.test(referencia)) return null;
  const [pedido] = await criarRepositorioPedidos(await bancoParaLeitura()).pedidos({ referencia });
  if (!pedido) return null;
  return {
    ...pedido,
    textoParaSdc:
      pedido.tipo === "VOO"
        ? textoDoPedidoDeVoo({
            referencia: pedido.referencia,
            eventoCodigo: pedido.evento.codigo,
            eventoNome: pedido.evento.nome,
            passageiro: pedido.pessoaNome ?? "—",
            trechos: pedido.trechos,
            observacaoTime: pedido.observacaoTime,
          })
        : null,
  };
}

/** Registra o pedido e, se o evento estava marcado como "não precisa de voo", desfaz o marcador (o pedido prova o contrário). */
export function registrarPedidoDeVoo(entrada: RegistrarPedidoDeVoo, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() =>
    transacao(ator, async (tx) => {
      const pedido = await servicoDePedidos.registrarPedidoDeVoo(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora });
      await desfazerDispensa(tx, pedido.eventoId, "VOO", ator.usuarioId);
      return pedido;
    }),
  );
}

export function alterarPedido(entrada: AlterarPedido, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.alterarPedido(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

/** "Também precisa de hotel" num pedido de voo que já existe (marcar ou desmarcar). */
export function definirHotelDoVoo(entrada: DefinirHotelDoVoo, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.definirHotelDoVoo(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

/**
 * Cancela o pedido. Se era um voo com "também precisa de hotel" e a pessoa já está num quarto sem outra origem, ela não
 * sai do quarto: fica como acrescentada na Hospedagem (`mantidaNoQuarto`), e o time decide lá.
 */
export function cancelarPedido(entrada: CancelarPedido, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() =>
    transacao(ator, async (tx) => {
      const pedido = await servicoDePedidos.cancelarPedido(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora });
      const mantidaNoQuarto =
        pedido.tipo === "VOO" && pedido.pessoaId !== null && pedido.precisaHotel
          ? await manterNoQuartoSemOrigem(tx, { eventoId: pedido.eventoId, pessoaId: pedido.pessoaId, usuarioId: ator.usuarioId, instante: agora, motivo: "VOO_CANCELADO" })
          : false;
      return { ...pedido, mantidaNoQuarto };
    }),
  );
}

/** "Registrar voo" em nome da SDC. */
export function registrarRetornoDaSdc(entrada: RegistrarRetornoDeVoo, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.registrarRetornoDeVoo(criarRepositorioPedidos(tx), entrada, { autor: { usuarioId: ator.usuarioId }, instante: agora })));
}

/** A mesma compra registrada pela própria SDC, na área dela (src/fluxos/sdc): mesmas validações e transições. */
export function registrarRetornoDeVooPelaSdc(entrada: RegistrarRetornoDeVoo, sdc: AtorSdcDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(sdc, (tx) => servicoDePedidos.registrarRetornoDeVoo(criarRepositorioPedidos(tx), entrada, { autor: { acessoSdcId: sdc.acessoSdcId }, instante: agora })));
}

/** "Aprovar pagamento": o time confirma que usou e que o valor registrado pode ser pago. */
export function aprovarPagamento(entrada: AprovarPagamento, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.aprovarPagamento(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

/** O time desfaz a aprovação: o pedido volta para "a aprovar" e a SDC pode corrigir a compra. */
export function desfazerAprovacao(entrada: { pedidoId: string }, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.desfazerAprovacao(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}
