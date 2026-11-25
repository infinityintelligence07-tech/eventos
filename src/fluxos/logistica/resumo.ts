import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioPedidos, dataEmSaoPaulo, textoDosDiasQueFaltam } from "@/modules/logistica";

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

import { type ItemDoInicio, LIMITE_DE_EXEMPLOS } from "./comum";
import { avisoDeVoosPorEvento } from "./voos";

/**
 * Contrato §7.3: eventos que entraram no prazo do aviso (Configurações › Aviso de voos, padrão 90 dias) e ainda não
 * têm nenhum pedido de voo, fora os que o time marcou como "não precisa de voo"; e pedidos alterados sem novo retorno
 * da SDC. O aviso é por evento porque o voo é pedido antes da escala: a quantidade do cartão é o número de eventos.
 */
export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const hoje = dataEmSaoPaulo(agora);
  const db = await bancoParaLeitura();
  const repo = criarRepositorioPedidos(db);
  const [aviso, alterados, aAprovar] = await Promise.all([avisoDeVoosPorEvento(db, hoje), repo.pedidos({ desde: hoje, situacoes: ["ALTERADO"] }), repo.pedidos({ aAprovar: true })]);

  return [
    {
      chave: "voos-a-pedir",
      titulo: "Eventos sem pedido de voo",
      explicacao: `Eventos em ${aviso.diasDoAviso} dias ou menos que ainda não têm nenhum pedido de voo à SDC. Se o evento não precisa de voo, marque isso em Voos e ele sai daqui.`,
      quantidade: aviso.eventos.length,
      href: "/logistica/voos",
      exemplos: aviso.eventos.slice(0, LIMITE_DE_EXEMPLOS).map((evento) => ({
        rotulo: evento.codigo ?? evento.nome,
        detalhe: evento.janela === "ATRASADO" ? `atrasado · ${textoDosDiasQueFaltam(evento.dias)}` : textoDosDiasQueFaltam(evento.dias),
        href: `/logistica/voos?evento=${evento.eventoId}`,
      })),
    },
    {
      // Time solicita → SDC compra e registra o valor → time confere e aprova o pagamento (voo e hospedagem).
      chave: "compras-a-aprovar",
      titulo: "Compras da SDC a aprovar",
      quantidade: aAprovar.length,
      href: "/logistica/voos?situacao=EMITIDO",
      exemplos: aAprovar.slice(0, LIMITE_DE_EXEMPLOS).map((pedido) => ({
        rotulo: `${pedido.referencia} · ${pedido.pessoaNome ?? "Hospedagem"}`,
        detalhe: `${pedido.evento.codigo ?? pedido.evento.nome} · ${reais(pedido.valorCentavos ?? 0)}`,
        href: pedido.tipo === "VOO" ? `/logistica/voos?evento=${pedido.evento.id}&ref=${pedido.referencia}` : `/logistica/hospedagem?evento=${pedido.evento.id}`,
      })),
    },
    {
      chave: "pedidos-alterados",
      titulo: "Pedidos alterados sem retorno da SDC",
      quantidade: alterados.length,
      href: "/logistica/voos?situacao=ALTERADO",
      exemplos: alterados.slice(0, LIMITE_DE_EXEMPLOS).map((pedido) => ({
        rotulo: `${pedido.referencia} · ${pedido.pessoaNome ?? "Hospedagem"}`,
        detalhe: pedido.evento.codigo ?? pedido.evento.nome,
        href: pedido.tipo === "VOO" ? `/logistica/voos?ref=${pedido.referencia}` : `/logistica/hospedagem?evento=${pedido.evento.id}`,
      })),
    },
  ];
}
