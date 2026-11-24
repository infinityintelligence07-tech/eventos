// Prazo do formulário de custo que o próprio staff preenche (/solicitar-custo). Dias contados no fuso do time
// (America/Sao_Paulo), como nos outros módulos. O registro "em nome da pessoa" pelo time não tem prazo.
//   abre  = primeiro dia do evento
//   fecha = último dia do evento + DIAS_DE_PRAZO_DO_FORMULARIO, inclusive (até 23:59 de São Paulo)
//   corrigir a reprovada = até o prazo do evento ou DIAS_PARA_CORRIGIR depois da reprovação, o que acabar depois

/** Dias depois do último dia do evento em que o staff ainda envia a solicitação (o 5º dia inclusive). */
export const DIAS_DE_PRAZO_DO_FORMULARIO = 5;

/** Dias depois da reprovação em que o staff ainda corrige e reenvia (inclusive). */
export const DIAS_PARA_CORRIGIR = 5;

const FUSO = "America/Sao_Paulo";
const DIA_NO_FUSO = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** AAAA-MM-DD do instante em São Paulo. */
export function diaEmSaoPaulo(instante: Date): string {
  return DIA_NO_FUSO.format(instante);
}

/** AAAA-MM-DD + N dias (calendário, sem fuso). */
export function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Primeiro e último dia do evento, em AAAA-MM-DD de São Paulo. */
export type PeriodoDoEvento = { dataInicio: string; dataFim: string };

export type PrazoDoFormulario = { abreEm: string; fechaEm: string };

export type SituacaoDoPrazo = "AINDA_NAO_ABRIU" | "ABERTO" | "ENCERRADO";

const maiorDia = (a: string, b: string) => (a > b ? a : b);

/** Primeiro e último dia (inclusive) em que o staff envia a solicitação do evento. */
export function prazoDoFormulario({ dataInicio, dataFim }: PeriodoDoEvento): PrazoDoFormulario {
  // Evento com fim antes do início (dado errado): vale o início como último dia.
  return { abreEm: dataInicio, fechaEm: somarDias(maiorDia(dataInicio, dataFim), DIAS_DE_PRAZO_DO_FORMULARIO) };
}

export function situacaoDoPrazo(evento: PeriodoDoEvento, agora: Date): SituacaoDoPrazo {
  const hoje = diaEmSaoPaulo(agora);
  const { abreEm, fechaEm } = prazoDoFormulario(evento);
  if (hoje < abreEm) return "AINDA_NAO_ABRIU";
  return hoje <= fechaEm ? "ABERTO" : "ENCERRADO";
}

/**
 * Último dia (inclusive) para o staff corrigir a solicitação reprovada. A auditoria costuma acontecer depois do
 * prazo do evento: por isso a correção ganha um prazo próprio, contado da reprovação.
 */
export function prazoDaCorrecao(evento: PeriodoDoEvento, reprovadaEm: Date): string {
  return maiorDia(prazoDoFormulario(evento).fechaEm, somarDias(diaEmSaoPaulo(reprovadaEm), DIAS_PARA_CORRIGIR));
}

/** Sem a data da reprovação (dado antigo), vale só o prazo do evento. */
export function podeCorrigirNoPrazo(evento: PeriodoDoEvento, reprovadaEm: Date | null, agora: Date): boolean {
  const ate = reprovadaEm ? prazoDaCorrecao(evento, reprovadaEm) : prazoDoFormulario(evento).fechaEm;
  return diaEmSaoPaulo(agora) <= ate;
}
