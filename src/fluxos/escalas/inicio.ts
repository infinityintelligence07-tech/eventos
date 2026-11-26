import { bancoParaLeitura } from "@/fluxos/_base";
import { criarConsultaDaEscala, type EventoDaLista } from "@/modules/escala";
import { dataEmSaoPaulo, DIAS_PARA_MONTAR_ESCALA, somarDias } from "@/modules/eventos";

import { EXEMPLOS_NO_INICIO, type ItemDoInicio } from "./comum";

// Itens das Escalas no Início (docs/07 §7.3). "Pessoas sem resposta" saiu: quem está na escala já conta como confirmado.

const UM_DIA_MS = 24 * 60 * 60 * 1000;

const identificacao = (evento: Pick<EventoDaLista, "codigo" | "nome">) => evento.codigo ?? evento.nome;
const dataCurta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const escala = (eventoId: string) => `/eventos/${eventoId}/escala`;

function haQuanto(instante: Date, agora: Date): string {
  const dias = Math.floor((agora.getTime() - instante.getTime()) / UM_DIA_MS);
  if (dias <= 0) return "a mais antiga enviada hoje";
  return dias === 1 ? "a mais antiga há 1 dia" : `a mais antiga há ${dias} dias`;
}

/** "2 · CONF_AM_60, ASM_AM_237 e mais 1": o total da situação e quem são, para o cartão único de escalas. */
function totalComNomes(lista: EventoDaLista[]): string {
  if (lista.length === 0) return "0";
  const nomes = lista.slice(0, 2).map(identificacao).join(", ");
  return `${lista.length} · ${nomes}${lista.length > 2 ? ` e mais ${lista.length - 2}` : ""}`;
}

export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const consulta = criarConsultaDaEscala(await bancoParaLeitura());
  const hoje = dataEmSaoPaulo(agora);
  const [proximos, aguardando, devolvidas, jaAprovadas] = await Promise.all([
    consulta.eventosDaLista({ de: hoje, ate: somarDias(hoje, DIAS_PARA_MONTAR_ESCALA), statusEscala: ["SEM_ESCALA", "RASCUNHO"] }),
    consulta.eventosDaLista({ statusEscala: ["AGUARDANDO_APROVACAO"] }),
    consulta.eventosDaLista({ de: hoje, statusEscala: ["DEVOLVIDA"] }),
    consulta.eventosDaLista({ de: hoje, statusEscala: ["APROVADA"] }),
  ]);
  const ativos = (lista: EventoDaLista[]) => lista.filter((evento) => evento.status !== "CANCELADO" && evento.status !== "CONCLUIDO");
  const aMontar = ativos(proximos).filter((evento) => evento.tipoSigla !== "MC");
  const masterclassesAMontar = ativos(proximos).filter((evento) => evento.tipoSigla === "MC");
  const naFila = ativos(aguardando);
  const naoAprovadas = ativos(devolvidas);
  // Masterclass não passa por aprovação: a dela aparece como concluída na lista, não neste cartão.
  const aprovadas = ativos(jaAprovadas).filter((evento) => evento.tipoSigla !== "MC");
  const exemplosAMontar = (lista: EventoDaLista[]) =>
    lista.slice(0, EXEMPLOS_NO_INICIO).map((evento) => ({
      rotulo: `${identificacao(evento)} · ${dataCurta(evento.dataInicio)}`,
      detalhe: `${evento.preenchidas} de ${evento.vagas} vagas`,
      href: escala(evento.id),
    }));

  return [
    // Dois avisos de "a montar": eventos e Masterclass, separados (Vitor, 26/11/2026).
    { chave: "escalas-a-montar", titulo: "Escalas a montar · Eventos", quantidade: aMontar.length, href: "/escalas?situacao=a-montar", exemplos: exemplosAMontar(aMontar) },
    {
      chave: "escalas-a-montar-masterclass",
      titulo: "Escalas a montar · Masterclass",
      quantidade: masterclassesAMontar.length,
      href: "/escalas?situacao=a-montar&tipo=MC&masterclass=mostrar",
      exemplos: exemplosAMontar(masterclassesAMontar),
    },
    // Só o número do topo; o cartão é o "Escalas", logo abaixo.
    { chave: "escalas-aguardando-aprovacao", titulo: "Aguardando aprovação", quantidade: naFila.length, href: "/escalas/aprovacao", exemplos: [], semCartao: true },
    // Um cartão só para a aprovação das escalas: as não aprovadas, as que esperam a líder e as aprovadas.
    {
      chave: "escalas-situacao",
      titulo: "Escalas",
      quantidade: naoAprovadas.length + naFila.length,
      href: "/escalas",
      listaCompleta: true,
      exemplos: [
        { rotulo: "Não aprovadas", detalhe: totalComNomes(naoAprovadas), href: "/escalas?situacao=nao-aprovadas" },
        { rotulo: naFila.some((evento) => evento.enviadaEm) ? `Aguardando aprovação (${haQuanto(maisAntiga(naFila), agora)})` : "Aguardando aprovação", detalhe: totalComNomes(naFila), href: "/escalas/aprovacao" },
        { rotulo: "Aprovadas", detalhe: totalComNomes(aprovadas), href: "/escalas?situacao=aprovadas" },
      ],
    },
  ];
}

/** O envio mais antigo ainda na fila (para "a mais antiga enviada há 3 dias"). */
function maisAntiga(fila: EventoDaLista[]): Date {
  return fila.reduce<Date>((antiga, evento) => (evento.enviadaEm && evento.enviadaEm < antiga ? evento.enviadaEm : antiga), new Date(8640000000000000));
}
