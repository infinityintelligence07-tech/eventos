import { bancoParaLeitura, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import {
  type AlterarPedido,
  type CancelarPedido,
  criarRepositorioPedidos,
  dataEmSaoPaulo,
  type EventoDaLogistica,
  type JanelaDeCompra,
  janelaDeCompra,
  type PassageiroDeVoo,
  type PedidoDaSdc,
  pedidoAtivo,
  precisaPedir,
  type RegistrarPedidoDeVoo,
  type RegistrarRetornoDeHospedagem,
  type RegistrarRetornoDeVoo,
  servicoDePedidos,
  type SituacaoDoVoo,
  textoDoPedidoDeVoo,
} from "@/modules/logistica";

import { traduzirErros } from "./comum";

export type LinhaDeVoo = {
  chave: string;
  situacao: SituacaoDoVoo;
  evento: EventoDaLogistica;
  passageiro: { convocacaoId: string | null; pessoaId: string | null; nome: string };
  janela: { janela: JanelaDeCompra; dias: number };
  pedido: PedidoDaSdc | null;
};

export type FiltroDeVoos = { eventoId?: string; situacao?: SituacaoDoVoo };

export type VoosCarregados = {
  eventos: EventoDaLogistica[];
  linhas: LinhaDeVoo[];
  contagens: Record<SituacaoDoVoo, number>;
  /** "A pedir" com o evento na janela de 90 dias ou já atrasado. */
  aPedirNaJanela: number;
  /** Quem pode receber um pedido novo (VOO sem pedido ativo). */
  semPedido: PassageiroDeVoo[];
};

const SITUACOES: SituacaoDoVoo[] = ["A_PEDIR", "PEDIDO", "EMITIDO", "ALTERADO", "CANCELADO"];

function linhasDeVoo(passageiros: PassageiroDeVoo[], pedidos: PedidoDaSdc[], hoje: string): { linhas: LinhaDeVoo[]; semPedido: PassageiroDeVoo[] } {
  const comPedidoAtivo = new Set(pedidos.filter((pedido) => pedidoAtivo(pedido.situacao)).map((pedido) => `${pedido.evento.id}|${pedido.pessoaId}`));
  const semPedido = passageiros.filter((passageiro) => !comPedidoAtivo.has(`${passageiro.evento.id}|${passageiro.pessoaId}`));
  const linhas: LinhaDeVoo[] = [
    ...semPedido.map((passageiro) => ({
      chave: `a-pedir-${passageiro.convocacaoId}`,
      situacao: "A_PEDIR" as const,
      evento: passageiro.evento,
      passageiro: { convocacaoId: passageiro.convocacaoId, pessoaId: passageiro.pessoaId, nome: passageiro.pessoaNome },
      janela: janelaDeCompra(passageiro.evento.dataInicio, hoje),
      pedido: null,
    })),
    ...pedidos.map((pedido) => ({
      chave: pedido.id,
      situacao: pedido.situacao,
      evento: pedido.evento,
      passageiro: { convocacaoId: pedido.convocacaoId, pessoaId: pedido.pessoaId, nome: pedido.pessoaNome ?? "—" },
      janela: janelaDeCompra(pedido.evento.dataInicio, hoje),
      pedido,
    })),
  ];
  linhas.sort(
    (a, b) =>
      a.evento.dataInicio.localeCompare(b.evento.dataInicio) ||
      SITUACOES.indexOf(a.situacao) - SITUACOES.indexOf(b.situacao) ||
      a.passageiro.nome.localeCompare(b.passageiro.nome, "pt-BR"),
  );
  return { linhas, semPedido };
}

/** Logística › Voos: pedidos à SDC entre eventos (do dia em diante) e quem vai de avião sem pedido. */
export async function carregarVoos(filtro: FiltroDeVoos, agora: Date): Promise<VoosCarregados> {
  const hoje = dataEmSaoPaulo(agora);
  const repo = criarRepositorioPedidos(await bancoParaLeitura());
  const [eventos, passageiros, pedidos] = await Promise.all([
    repo.eventosDaLogistica({ desde: hoje }),
    repo.passageirosDeVoo({ desde: hoje, eventoId: filtro.eventoId }),
    repo.pedidos({ desde: hoje, eventoId: filtro.eventoId, tipo: "VOO" }),
  ]);
  const { linhas, semPedido } = linhasDeVoo(passageiros, pedidos, hoje);
  const contagens = Object.fromEntries(SITUACOES.map((situacao) => [situacao, linhas.filter((linha) => linha.situacao === situacao).length])) as Record<SituacaoDoVoo, number>;
  return {
    eventos,
    linhas: filtro.situacao ? linhas.filter((linha) => linha.situacao === filtro.situacao) : linhas,
    contagens,
    aPedirNaJanela: linhas.filter((linha) => linha.situacao === "A_PEDIR" && precisaPedir(linha.janela.janela)).length,
    semPedido,
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

export function registrarPedidoDeVoo(entrada: RegistrarPedidoDeVoo, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.registrarPedidoDeVoo(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

export function alterarPedido(entrada: AlterarPedido, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.alterarPedido(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

export function cancelarPedido(entrada: CancelarPedido, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.cancelarPedido(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

/** "Registrar voo" em nome da SDC. */
export function registrarRetornoDaSdc(entrada: RegistrarRetornoDeVoo, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.registrarRetornoDeVoo(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}

/** "Registrar reserva" do hotel em nome da SDC. */
export function registrarRetornoDeHospedagem(entrada: RegistrarRetornoDeHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.registrarRetornoDeHospedagem(criarRepositorioPedidos(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })));
}
