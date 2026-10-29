// Formatos da doc 08 §1 (pt-BR, fuso America/Sao_Paulo). Datas sem hora chegam como texto AAAA-MM-DD.

const FUSO = "America/Sao_Paulo";

type Data = string | Date;

function partesEmSaoPaulo(instante: Date) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return { dia: parte("day"), mes: parte("month"), ano: parte("year"), hora: parte("hour"), minuto: parte("minute") };
}

function diaMesAno(data: Data): { dia: string; mes: string; ano: string } {
  if (typeof data === "string") return { dia: data.slice(8, 10), mes: data.slice(5, 7), ano: data.slice(0, 4) };
  return partesEmSaoPaulo(data);
}

/** 12/11 */
export function dataCurta(data: Data): string {
  const { dia, mes } = diaMesAno(data);
  return `${dia}/${mes}`;
}

/** 12/11/2026 */
export function dataCompleta(data: Data): string {
  const { dia, mes, ano } = diaMesAno(data);
  return `${dia}/${mes}/${ano}`;
}

/** 12/11 às 14:30 */
export function dataEHora(instante: Date | string): string {
  const { dia, mes, hora, minuto } = partesEmSaoPaulo(typeof instante === "string" ? new Date(instante) : instante);
  return `${dia}/${mes} às ${hora}:${minuto}`;
}

/** 14:30 */
export function hora(instante: Date | string): string {
  const { hora: horas, minuto } = partesEmSaoPaulo(typeof instante === "string" ? new Date(instante) : instante);
  return `${horas}:${minuto}`;
}

/** 12/11 a 14/11 (um dia só: 12/11) */
export function periodo(inicio: Data, fim: Data): string {
  const de = dataCurta(inicio);
  const ate = dataCurta(fim);
  return de === ate ? de : `${de} a ${ate}`;
}

/** "Confronto 60" para eventos; o nome (a cidade) para Masterclass. O mesmo rótulo em todas as telas. */
export function nomeCurtoDoEvento(evento: { tipoSigla: string | null; tipoNome: string | null; edicao: string | null; nome: string }): string {
  if (evento.tipoSigla === "MC" || !evento.tipoNome) return evento.nome;
  return [evento.tipoNome, evento.edicao].filter(Boolean).join(" ");
}

/** 08:00–18:00 */
export function horario(inicio: string, fim: string): string {
  return `${inicio.slice(0, 5)}–${fim.slice(0, 5)}`;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56 — o banco guarda centavos inteiros. */
export function dinheiro(centavos: number): string {
  return REAIS.format(centavos / 100);
}

const UMA_CASA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 123,4 km */
export function distancia(km: number): string {
  return `${UMA_CASA.format(km)} km`;
}

/** 10,5 km/l */
export function consumo(kmPorLitro: number): string {
  return `${UMA_CASA.format(kmPorLitro)} km/l`;
}

/** 18 de 22 vagas */
export function quantidadeDe(quantidade: number, total: number, unidade?: string): string {
  const texto = `${quantidade.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`;
  return unidade ? `${texto} ${unidade}` : texto;
}
