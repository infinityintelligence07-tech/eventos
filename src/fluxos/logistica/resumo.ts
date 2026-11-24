import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioPedidos, dataEmSaoPaulo, eventosComPassagensAPedir, pedidoAtivo, textoDasPassagensAPedir, textoDosDiasQueFaltam } from "@/modules/logistica";

import { diasDoAvisoDeVoos } from "./aviso";
import { type ItemDoInicio, LIMITE_DE_EXEMPLOS } from "./comum";

/**
 * Contrato §7.3: passagens a pedir nos eventos que já entraram na janela do aviso (Configurações › Aviso de voos,
 * padrão 90 dias) e pedidos alterados sem novo retorno da SDC. O cartão de voos mostra, por evento, quantas
 * passagens faltam pedir e quantos dias faltam; a quantidade do cartão é o total de passagens.
 */
export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const hoje = dataEmSaoPaulo(agora);
  const db = await bancoParaLeitura();
  const repo = criarRepositorioPedidos(db);
  const [passageiros, pedidos, diasDoAviso] = await Promise.all([repo.passageirosDeVoo({ desde: hoje }), repo.pedidos({ desde: hoje }), diasDoAvisoDeVoos(db)]);

  const comPedido = new Set(pedidos.filter((pedido) => pedido.tipo === "VOO" && pedidoAtivo(pedido.situacao)).map((pedido) => `${pedido.evento.id}|${pedido.pessoaId}`));
  const eventos = eventosComPassagensAPedir(
    passageiros.filter((passageiro) => !comPedido.has(`${passageiro.evento.id}|${passageiro.pessoaId}`)),
    hoje,
    diasDoAviso,
  );
  const alterados = pedidos.filter((pedido) => pedido.situacao === "ALTERADO");

  return [
    {
      chave: "voos-a-pedir",
      titulo: "Voos a pedir à SDC",
      explicacao:
        diasDoAviso === 1
          ? "Eventos a 1 dia ou menos com pessoas que vão de avião e ainda sem pedido à SDC."
          : `Eventos em ${diasDoAviso} dias ou menos com pessoas que vão de avião e ainda sem pedido à SDC.`,
      quantidade: eventos.reduce((total, evento) => total + evento.passagens, 0),
      href: "/logistica/voos?situacao=A_PEDIR",
      exemplos: eventos.slice(0, LIMITE_DE_EXEMPLOS).map((evento) => ({
        rotulo: `${evento.codigo ?? evento.nome} · ${textoDasPassagensAPedir(evento.passagens)}`,
        detalhe: evento.janela === "ATRASADO" ? `atrasado · ${textoDosDiasQueFaltam(evento.dias)}` : textoDosDiasQueFaltam(evento.dias),
        href: `/logistica/voos?evento=${evento.eventoId}&situacao=A_PEDIR`,
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
        href: `/logistica/voos?ref=${pedido.referencia}`,
      })),
    },
  ];
}
