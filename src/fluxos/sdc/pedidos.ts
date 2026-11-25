import { type AtorSdcDaEscrita, bancoParaLeitura, RegraDeNegocioError } from "@/fluxos/_base";
import { registrarRetornoDeHospedagemPelaSdc, registrarRetornoDeVooPelaSdc } from "@/fluxos/logistica";
import {
  agruparPorMesEEvento,
  criarRepositorioDaSdc,
  dataEmSaoPaulo,
  type EventoParaASdc,
  type GrupoDoMes,
  type HospedagemParaASdc,
  type RegistrarCompraDeVooPelaSdc,
  type RegistrarReservaPelaSdc,
  type SituacaoDoPagamento,
  situacaoDoPagamento,
  somarDias,
  type TotaisDoPagamento,
  totaisDoPagamento,
  type VooParaASdc,
} from "@/modules/logistica";

// A área da SDC (docs/09 §15): a agência vê SÓ os pedidos de voo e de hospedagem e registra (ou corrige) a compra de
// cada um. Não cria, não altera e não cancela pedido, não mexe em quartos. As leituras usam consultas próprias
// (criarRepositorioDaSdc), que escolhem os campos um a um: nada do que as telas do time carregam passa por aqui.
// Quem chama (páginas e actions de /sdc) já conferiu que é um ator SDC ativo.

/** Eventos que terminaram há mais do que isto saem da lista da SDC. */
const DIAS_PARA_TRAS = 120;

/** Como a SDC lê cada pedido: o que falta ela fazer e em que pé está o pagamento. */
export type SituacaoParaASdc = "A_COMPRAR" | "AGUARDANDO_APROVACAO" | "APROVADO" | "CANCELADO";
export const SITUACOES_DA_SDC: readonly SituacaoParaASdc[] = ["A_COMPRAR", "AGUARDANDO_APROVACAO", "APROVADO", "CANCELADO"];

export type FiltroDaSdc = { situacao?: SituacaoParaASdc };

function paraASdc(pagamento: SituacaoDoPagamento): SituacaoParaASdc {
  switch (pagamento) {
    case "SEM_COMPRA":
      return "A_COMPRAR";
    case "A_APROVAR":
      return "AGUARDANDO_APROVACAO";
    case "APROVADO":
      return "APROVADO";
    case "CANCELADO":
      return "CANCELADO";
    default: {
      const desconhecida: never = pagamento;
      throw new Error(`situação de pagamento desconhecida: ${String(desconhecida)}`);
    }
  }
}

type ComSituacao<T> = T & {
  paraASdc: SituacaoParaASdc;
  /** A SDC registra a compra (a comprar) ou corrige (aguardando aprovação). Aprovado e cancelado são só leitura. */
  podeRegistrar: boolean;
};

export type VooDaSdc = ComSituacao<VooParaASdc>;
export type HospedagemDaSdc = ComSituacao<HospedagemParaASdc>;

type ListaDaSdc<T extends { evento: EventoParaASdc }> = {
  /** Mês → evento → pedidos, como na planilha. Já com o filtro de situação. */
  grupos: GrupoDoMes<EventoParaASdc & { id: string }, T & { evento: EventoParaASdc & { id: string } }>[];
  total: number;
  contagens: Record<SituacaoParaASdc, number>;
  /** Somas dos pedidos listados antes do filtro de situação: a aprovar pelo time e já aprovado para pagamento. */
  totais: TotaisDoPagamento;
};

export type VoosDaSdc = ListaDaSdc<VooDaSdc>;
export type HospedagensDaSdc = ListaDaSdc<HospedagemDaSdc>;

function montar<T extends VooParaASdc | HospedagemParaASdc>(pedidos: T[], filtro: FiltroDaSdc): ListaDaSdc<ComSituacao<T>> {
  const comSituacao = pedidos.map((pedido) => {
    const situacao = paraASdc(situacaoDoPagamento(pedido));
    return { ...pedido, paraASdc: situacao, podeRegistrar: situacao === "A_COMPRAR" || situacao === "AGUARDANDO_APROVACAO" };
  });
  const filtrados = filtro.situacao ? comSituacao.filter((pedido) => pedido.paraASdc === filtro.situacao) : comSituacao;
  return {
    // A chave do evento (só de agrupamento) faz o papel de id para agrupar.
    grupos: agruparPorMesEEvento(filtrados.map((pedido) => ({ ...pedido, evento: { ...pedido.evento, id: pedido.evento.chave } }))),
    total: filtrados.length,
    contagens: Object.fromEntries(SITUACOES_DA_SDC.map((situacao) => [situacao, comSituacao.filter((pedido) => pedido.paraASdc === situacao).length])) as Record<SituacaoParaASdc, number>,
    totais: totaisDoPagamento(pedidos),
  };
}

const desde = (agora: Date) => somarDias(dataEmSaoPaulo(agora), -DIAS_PARA_TRAS);

export async function carregarVoosDaSdc(filtro: FiltroDaSdc, agora: Date): Promise<VoosDaSdc> {
  return montar(await criarRepositorioDaSdc(await bancoParaLeitura()).voos({ desde: desde(agora) }), filtro);
}

export async function carregarHospedagensDaSdc(filtro: FiltroDaSdc, agora: Date): Promise<HospedagensDaSdc> {
  return montar(await criarRepositorioDaSdc(await bancoParaLeitura()).hospedagens({ desde: desde(agora) }), filtro);
}

const PEDIDO_NAO_ENCONTRADO = "Pedido não encontrado. Recarregue a página.";

/**
 * A SDC registra (ou corrige) a compra de um voo: companhia, número do voo, código da reserva, horários e valor.
 * Mesmas validações e transições do registro feito pelo time; pedido cancelado ou já aprovado é recusado pelo serviço.
 */
export async function registrarCompraDeVoo({ referencia, ...compra }: RegistrarCompraDeVooPelaSdc, sdc: AtorSdcDaEscrita, agora: Date): Promise<{ referencia: string }> {
  const pedidoId = await criarRepositorioDaSdc(await bancoParaLeitura()).idDoPedido(referencia, "VOO", { desde: desde(agora) });
  if (!pedidoId) throw new RegraDeNegocioError(PEDIDO_NAO_ENCONTRADO);
  await registrarRetornoDeVooPelaSdc({ pedidoId, ...compra }, sdc, agora);
  return { referencia };
}

/** A SDC registra (ou corrige) a reserva de uma hospedagem: o hotel, o número da reserva, o valor total e o pagamento. */
export async function registrarReservaDeHospedagem({ referencia, hotel, ...reserva }: RegistrarReservaPelaSdc, sdc: AtorSdcDaEscrita, agora: Date): Promise<{ referencia: string }> {
  const pedidoId = await criarRepositorioDaSdc(await bancoParaLeitura()).idDoPedido(referencia, "HOSPEDAGEM", { desde: desde(agora) });
  if (!pedidoId) throw new RegraDeNegocioError(PEDIDO_NAO_ENCONTRADO);
  await registrarRetornoDeHospedagemPelaSdc({ pedidoId, novoHotel: hotel, ...reserva }, sdc, agora);
  return { referencia };
}
