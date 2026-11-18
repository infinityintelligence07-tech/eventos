import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioCalendario, dataEmSaoPaulo, type Pendencias, pendenciasDosEventos, somarDias } from "@/modules/eventos";

/** Pendências olham este horizonte à frente, independente dos filtros da lista. */
const DIAS_DE_PENDENCIAS = 90;

/** Cartões "Precisa de ação" da aba Escalas: escalas a montar, Confronto sem fila e eventos sem código. */
export async function pendenciasDasEscalas(agora: Date): Promise<Pendencias> {
  const hoje = dataEmSaoPaulo(agora);
  const eventos = await criarRepositorioCalendario(await bancoParaLeitura()).eventosDoPeriodo({ de: hoje, ate: somarDias(hoje, DIAS_DE_PENDENCIAS) });
  return pendenciasDosEventos(eventos, hoje);
}
