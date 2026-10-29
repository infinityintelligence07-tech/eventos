import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioCalendario, dataEmSaoPaulo, type EventoNoCalendario, pendenciasDosEventos, somarDias } from "@/modules/eventos";

// Itens dos Eventos no Início (docs/07 §7.3): reaproveita as pendências do Calendário.

/** Mesmo formato em todos os fluxos (docs/07 §7.3). */
export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

const DIAS_DE_PENDENCIAS = 90;
const EXEMPLOS = 6;

const dataCurta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const hoje = dataEmSaoPaulo(agora);
  const eventos = await criarRepositorioCalendario(await bancoParaLeitura()).eventosDoPeriodo({ de: hoje, ate: somarDias(hoje, DIAS_DE_PENDENCIAS) });
  const { confrontoSemFila, semCodigo } = pendenciasDosEventos(eventos, hoje);
  const exemplo = (evento: EventoNoCalendario, ancora = "") => ({
    rotulo: evento.codigo ?? evento.nome,
    detalhe: dataCurta(evento.dataInicio),
    href: `/eventos/${evento.id}${ancora}`,
  });

  return [
    {
      chave: "confronto-sem-fila",
      titulo: "Confronto sem fila",
      quantidade: confrontoSemFila.length,
      href: "/calendario",
      exemplos: confrontoSemFila.slice(0, EXEMPLOS).map((evento) => exemplo(evento, "#fila")),
    },
    {
      chave: "eventos-sem-codigo",
      titulo: "Pendências da sincronização",
      quantidade: semCodigo.length,
      href: "/calendario",
      exemplos: semCodigo.slice(0, EXEMPLOS).map((evento) => exemplo(evento)),
    },
  ];
}
