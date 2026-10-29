import { bancoParaLeitura } from "@/fluxos/_base";
import { criarConsultaDaEscala, type EventoDaLista } from "@/modules/escala";
import { dataEmSaoPaulo, DIAS_PARA_MONTAR_ESCALA, somarDias } from "@/modules/eventos";

import { EXEMPLOS_NO_INICIO, type ItemDoInicio } from "./comum";

// Itens das Escalas no Início (docs/07 §7.3).

const DIAS_SEM_RESPOSTA = 2;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const identificacao = (evento: Pick<EventoDaLista, "codigo" | "nome">) => evento.codigo ?? evento.nome;
const dataCurta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const escala = (eventoId: string) => `/eventos/${eventoId}/escala`;

function haQuanto(instante: Date, agora: Date): string {
  const dias = Math.floor((agora.getTime() - instante.getTime()) / UM_DIA_MS);
  if (dias <= 0) return "enviada hoje";
  return dias === 1 ? "enviada há 1 dia" : `enviada há ${dias} dias`;
}

export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const consulta = criarConsultaDaEscala(await bancoParaLeitura());
  const hoje = dataEmSaoPaulo(agora);
  const [proximos, aguardando, devolvidas, semResposta] = await Promise.all([
    consulta.eventosDaLista({ de: hoje, ate: somarDias(hoje, DIAS_PARA_MONTAR_ESCALA), statusEscala: ["SEM_ESCALA", "RASCUNHO"] }),
    consulta.eventosDaLista({ statusEscala: ["AGUARDANDO_APROVACAO"] }),
    consulta.eventosDaLista({ de: hoje, statusEscala: ["DEVOLVIDA"] }),
    consulta.semResposta(new Date(agora.getTime() - DIAS_SEM_RESPOSTA * UM_DIA_MS), hoje),
  ]);
  const ativos = (lista: EventoDaLista[]) => lista.filter((evento) => evento.status !== "CANCELADO" && evento.status !== "CONCLUIDO");
  const aMontar = ativos(proximos).filter((evento) => evento.tipoSigla !== "MC");
  const naFila = ativos(aguardando);
  const paraAjustar = ativos(devolvidas);

  return [
    {
      chave: "escalas-a-montar",
      titulo: "Escalas a montar",
      quantidade: aMontar.length,
      href: "/escalas?situacao=a-montar",
      exemplos: aMontar.slice(0, EXEMPLOS_NO_INICIO).map((evento) => ({
        rotulo: `${identificacao(evento)} · ${dataCurta(evento.dataInicio)}`,
        detalhe: `${evento.preenchidas} de ${evento.vagas} vagas`,
        href: escala(evento.id),
      })),
    },
    {
      chave: "escalas-aguardando-aprovacao",
      titulo: "Aguardando aprovação",
      quantidade: naFila.length,
      href: "/escalas/aprovacao",
      exemplos: naFila.slice(0, EXEMPLOS_NO_INICIO).map((evento) => ({
        rotulo: `${identificacao(evento)} · ${dataCurta(evento.dataInicio)}`,
        detalhe: evento.enviadaEm ? haQuanto(evento.enviadaEm, agora) : undefined,
        href: "/escalas/aprovacao",
      })),
    },
    {
      chave: "escalas-devolvidas",
      titulo: "Escalas devolvidas",
      quantidade: paraAjustar.length,
      href: "/escalas?situacao=devolvidas",
      exemplos: paraAjustar.slice(0, EXEMPLOS_NO_INICIO).map((evento) => ({
        rotulo: identificacao(evento),
        detalhe: evento.comentarioDaDevolucao?.split("\n")[0]?.slice(0, 80) || undefined,
        href: escala(evento.id),
      })),
    },
    {
      chave: "escalas-sem-resposta",
      titulo: "Pessoas sem resposta",
      quantidade: semResposta.length,
      href: "/escalas?situacao=aprovadas",
      exemplos: semResposta.slice(0, EXEMPLOS_NO_INICIO).map((item) => ({
        rotulo: `${item.nome} · ${item.codigo ?? "evento sem código"}`,
        detalhe: item.funcao,
        href: escala(item.eventoId),
      })),
    },
  ];
}
