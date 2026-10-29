import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioPedidos, dataEmSaoPaulo, janelaDeCompra, pedidoAtivo, precisaPedir } from "@/modules/logistica";

import { type ItemDoInicio, LIMITE_DE_EXEMPLOS } from "./comum";

/** Contrato §7.3: voos a pedir na janela D-90 e pedidos alterados sem novo retorno da SDC. */
export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const hoje = dataEmSaoPaulo(agora);
  const repo = criarRepositorioPedidos(await bancoParaLeitura());
  const [passageiros, pedidos] = await Promise.all([repo.passageirosDeVoo({ desde: hoje }), repo.pedidos({ desde: hoje })]);

  const comPedido = new Set(pedidos.filter((pedido) => pedido.tipo === "VOO" && pedidoAtivo(pedido.situacao)).map((pedido) => `${pedido.evento.id}|${pedido.pessoaId}`));
  const aPedir = passageiros
    .filter((passageiro) => !comPedido.has(`${passageiro.evento.id}|${passageiro.pessoaId}`))
    .map((passageiro) => ({ passageiro, janela: janelaDeCompra(passageiro.evento.dataInicio, hoje) }))
    .filter(({ janela }) => precisaPedir(janela.janela))
    .sort((a, b) => a.janela.dias - b.janela.dias);
  const alterados = pedidos.filter((pedido) => pedido.situacao === "ALTERADO");

  return [
    {
      chave: "voos-a-pedir",
      titulo: "Voos a pedir à SDC",
      quantidade: aPedir.length,
      href: "/logistica/voos?situacao=A_PEDIR",
      exemplos: aPedir.slice(0, LIMITE_DE_EXEMPLOS).map(({ passageiro, janela }) => ({
        rotulo: `${passageiro.pessoaNome} · ${passageiro.evento.codigo ?? passageiro.evento.nome}`,
        detalhe: janela.janela === "ATRASADO" ? `atrasado · faltam ${janela.dias} dias` : `faltam ${janela.dias} dias`,
        href: `/eventos/${passageiro.evento.id}/logistica`,
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
