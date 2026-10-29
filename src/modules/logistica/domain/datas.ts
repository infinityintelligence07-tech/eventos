// Datas de calendário (AAAA-MM-DD) no fuso America/Sao_Paulo. O instante "agora" chega como parâmetro.

const FUSO = "America/Sao_Paulo";
const UM_DIA_MS = 86_400_000;

/** Dia (AAAA-MM-DD) do instante em São Paulo. */
export function dataEmSaoPaulo(instante: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

function diaUtc(data: string): number {
  return Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)));
}

/** Dias de `de` até `ate` (negativo se `ate` vem antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((diaUtc(ate) - diaUtc(de)) / UM_DIA_MS);
}

export function somarDias(data: string, dias: number): string {
  return new Date(diaUtc(data) + dias * UM_DIA_MS).toISOString().slice(0, 10);
}

/**
 * "2026-11-05T08:10" (campo datetime-local, hora de São Paulo) → instante.
 * São Paulo não tem horário de verão desde 2019: o deslocamento é sempre -03:00.
 */
export function instanteDeSaoPaulo(dataEHora: string): Date {
  return new Date(`${dataEHora.slice(0, 16)}:00-03:00`);
}
