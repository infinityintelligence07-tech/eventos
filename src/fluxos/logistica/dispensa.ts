import { bancoParaLeitura, type Executor, RegraDeNegocioError, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import { criarRepositorioEvento, type MarcadorDaLogistica } from "@/modules/eventos";
import { criarRepositorioHospedagem, criarRepositorioPedidos, type DispensarLogisticaDoEvento, type ItemDispensavel } from "@/modules/logistica";

// "Este evento não precisa de voo" e "este evento não tem hospedagem" (o "Sem hospedagem" da planilha): o time marca
// por evento, o evento sai dos pendentes (aviso de voos; evento padrão da Hospedagem) e dá para desfazer. O marcador
// mora no evento (tabela do módulo eventos); quem e quando ficam no registro_acao.

const MARCADOR: Record<ItemDispensavel, MarcadorDaLogistica> = { VOO: "SEM_VOO", HOSPEDAGEM: "SEM_HOSPEDAGEM" };

const EVENTO_SUMIU = "Evento não encontrado. Recarregue a página.";

/** `mudou` falso = o evento já estava assim (nada é gravado nem registrado). */
export async function dispensarLogisticaDoEvento({ eventoId, item, dispensar }: DispensarLogisticaDoEvento, ator: AtorDaEscrita): Promise<{ mudou: boolean }> {
  const marcador = MARCADOR[item];
  const atual = await criarRepositorioEvento(await bancoParaLeitura()).marcadoresDaLogistica(eventoId);
  if (!atual) throw new RegraDeNegocioError(EVENTO_SUMIU);
  if ((item === "VOO" ? atual.semVoo : atual.semHospedagem) === dispensar) return { mudou: false };

  return transacao(ator, async (tx) => {
    // Trava o evento: um pedido de voo registrado ao mesmo tempo espera esta decisão (e vice-versa).
    if (!(await criarRepositorioPedidos(tx).travarEvento(eventoId))) throw new RegraDeNegocioError(EVENTO_SUMIU);
    if (dispensar && item === "VOO" && (await criarRepositorioPedidos(tx).temPedidoDeVooAtivo(eventoId))) {
      throw new RegraDeNegocioError("Este evento já tem pedido de voo: não dá para marcar que ele não precisa de voo. Cancele os pedidos antes, se for o caso.");
    }
    if (dispensar && item === "HOSPEDAGEM" && (await criarRepositorioHospedagem(tx).hospedagensDoEventoQuantas(eventoId)) > 0) {
      throw new RegraDeNegocioError("Este evento já tem quartos montados: remova a hospedagem antes de marcar que ele não tem hospedagem.");
    }
    const eventos = criarRepositorioEvento(tx);
    const mudou = await eventos.definirMarcadorDaLogistica(eventoId, marcador, dispensar);
    if (mudou) await eventos.registrarMarcadorDaLogistica(eventoId, { marcador, valor: dispensar, usuarioId: ator.usuarioId });
    return { mudou };
  });
}

/**
 * Chamado na mesma transação de quem cria o primeiro pedido de voo ou a primeira hospedagem de um evento marcado como
 * "não precisa": o marcador deixa de valer sozinho (com registro), para a tela não dizer duas coisas opostas.
 */
export async function desfazerDispensa(tx: Executor, eventoId: string, item: ItemDispensavel, usuarioId: string): Promise<void> {
  const eventos = criarRepositorioEvento(tx);
  const motivo = item === "VOO" ? "pedido de voo registrado" : "hospedagem criada";
  if (await eventos.definirMarcadorDaLogistica(eventoId, MARCADOR[item], false)) {
    await eventos.registrarMarcadorDaLogistica(eventoId, { marcador: MARCADOR[item], valor: false, usuarioId, motivo });
  }
}
