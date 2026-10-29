// Datas da enquete no fuso do time (America/Sao_Paulo). O campo "Fecha em" chega sem fuso (datetime-local).

const FUSO = "America/Sao_Paulo";

const PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number };

function partesEmSaoPaulo(instante: Date): Partes {
  const partes = PARTES.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);
  return { ano: valor("year"), mes: valor("month"), dia: valor("day"), hora: valor("hour"), minuto: valor("minute"), segundo: valor("second") };
}

const doisDigitos = (numero: number) => String(numero).padStart(2, "0");

/** AAAA-MM-DD do instante em São Paulo. */
export function diaEmSaoPaulo(instante: Date): string {
  const { ano, mes, dia } = partesEmSaoPaulo(instante);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/** AAAA-MM-DD + N dias (calendário, sem fuso). */
export function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

const DATA_HORA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026-11-15T23:59" lido como horário de São Paulo. Nulo se o texto não for data e hora válidas. */
export function instanteDeSaoPaulo(dataHoraLocal: string): Date | null {
  const encontrado = DATA_HORA_LOCAL.exec(dataHoraLocal);
  if (!encontrado) return null;
  const [ano, mes, dia, hora, minuto, segundo] = encontrado.slice(1).map((parte) => Number(parte ?? 0)) as [number, number, number, number, number, number];
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  const conferido = new Date(comoUtc);
  if (conferido.getUTCMonth() !== mes - 1 || conferido.getUTCDate() !== dia || hora > 23 || minuto > 59) return null;

  // Desloca pelo fuso de São Paulo naquele instante (o fuso já teve horário de verão).
  const local = partesEmSaoPaulo(conferido);
  const deslocamento = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto, local.segundo) - comoUtc;
  return new Date(comoUtc - deslocamento);
}

/** Valor para o campo datetime-local: "2026-11-15T23:59". */
export function dataHoraLocal(instante: Date): string {
  const { ano, mes, dia, hora, minuto } = partesEmSaoPaulo(instante);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}T${doisDigitos(hora)}:${doisDigitos(minuto)}`;
}

/** 12/11 (de AAAA-MM-DD). */
export function diaEMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** 15/11 às 23:59 */
export function diaEHora(instante: Date): string {
  const { mes, dia, hora, minuto } = partesEmSaoPaulo(instante);
  return `${doisDigitos(dia)}/${doisDigitos(mes)} às ${doisDigitos(hora)}:${doisDigitos(minuto)}`;
}

/** 12/11 a 14/11 (um dia só: 12/11). */
export function periodoCurto(de: string, ate: string): string {
  return de === ate ? diaEMes(de) : `${diaEMes(de)} a ${diaEMes(ate)}`;
}
