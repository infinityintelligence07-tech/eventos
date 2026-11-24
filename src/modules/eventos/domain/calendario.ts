import type { StatusEvento } from "./turma";

// Calendário do time de eventos: o mês em semanas (segunda a domingo, como no IAM Control), a faixa de cada
// evento na semana, a situação para a cor e o que precisa de ação. Datas são texto AAAA-MM-DD no fuso de São Paulo.

/** Valores do CHECK evento_status_escala_check. AGUARDANDO_APROVACAO e DEVOLVIDA só existem com a migration 0004. */
export type StatusEscala = "SEM_ESCALA" | "RASCUNHO" | "AGUARDANDO_APROVACAO" | "DEVOLVIDA" | "APROVADA" | "COMUNICADA";

export type EventoNoCalendario = {
  id: string;
  nome: string;
  codigo: string | null;
  edicao: string | null;
  tipoSigla: string;
  tipoNome: string;
  poloCodigo: string | null;
  dataInicio: string;
  dataFim: string;
  status: StatusEvento;
  statusEscala: StatusEscala;
  expectativaPublico: number | null;
  pessoasNaFila: number | null;
  vagas: number;
};

export type SituacaoNoCalendario = "CANCELADO" | "CONCLUIDO" | StatusEscala;

export type Mes = { ano: number; mes: number };

export const SIGLA_MASTERCLASS = "MC";

const MES_TEXTO = /^(\d{4})-(0[1-9]|1[0-2])$/;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export function ehMasterclass(evento: Pick<EventoNoCalendario, "tipoSigla">): boolean {
  return evento.tipoSigla === SIGLA_MASTERCLASS;
}

/** Atalho do Calendário, como no IAM Control: palestra é a Masterclass; evento é todo o resto. */
export const RECORTES_DO_CALENDARIO = ["todos", "eventos", "palestras"] as const;
export type RecorteDoCalendario = (typeof RECORTES_DO_CALENDARIO)[number];
/** O que a tela mostra sem o filtro no endereço. */
export const RECORTE_PADRAO: RecorteDoCalendario = "todos";

/** Vazio ou desconhecido -> o padrão. */
export function recorteDoTexto(texto: string | undefined): RecorteDoCalendario {
  return RECORTES_DO_CALENDARIO.find((recorte) => recorte === texto) ?? RECORTE_PADRAO;
}

export function noRecorte(evento: Pick<EventoNoCalendario, "tipoSigla">, recorte: RecorteDoCalendario): boolean {
  switch (recorte) {
    case "todos":
      return true;
    case "eventos":
      return !ehMasterclass(evento);
    case "palestras":
      return ehMasterclass(evento);
    default: {
      const desconhecido: never = recorte;
      throw new Error(`recorte desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Data (AAAA-MM-DD) do instante no fuso de São Paulo. */
export function dataEmSaoPaulo(instante: Date): string {
  return instante.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function paraUtc(data: string): Date {
  return new Date(`${data}T00:00:00Z`);
}

function textoDaData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function somarDias(data: string, dias: number): string {
  return textoDaData(new Date(paraUtc(data).getTime() + dias * UM_DIA_MS));
}

/** "2026-11" -> mês; vazio ou inválido -> o mês de `hoje`. */
export function mesDoTexto(texto: string | undefined, hoje: string): Mes {
  const encontrado = MES_TEXTO.exec(texto ?? "") ?? MES_TEXTO.exec(hoje.slice(0, 7));
  return { ano: Number(encontrado![1]), mes: Number(encontrado![2]) };
}

export function textoDoMes({ ano, mes }: Mes): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function deslocarMes({ ano, mes }: Mes, meses: number): Mes {
  const indice = ano * 12 + (mes - 1) + meses;
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

/** "Novembro de 2026" */
export function nomeDoMes(mes: Mes): string {
  const nome = paraUtc(`${textoDoMes(mes)}-01`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export function primeiroDia(mes: Mes): string {
  return `${textoDoMes(mes)}-01`;
}

export function ultimoDia(mes: Mes): string {
  return somarDias(primeiroDia(deslocarMes(mes, 1)), -1);
}

/** Semanas de segunda a domingo que cobrem o mês inteiro: o evento de quinta a domingo cabe numa semana só. */
export function semanasDoMes(mes: Mes): string[][] {
  const inicio = primeiroDia(mes);
  const segunda = somarDias(inicio, -((paraUtc(inicio).getUTCDay() + 6) % 7));
  const fim = ultimoDia(mes);
  const semanas: string[][] = [];
  for (let semana = segunda; semana <= fim; semana = somarDias(semana, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, dia) => somarDias(semana, dia)));
  }
  return semanas;
}

/** O pedaço de um evento dentro de uma semana: uma faixa contínua do primeiro ao último dia dele ali. */
export type FaixaDaSemana<Item> = {
  item: Item;
  /** Coluna do primeiro dia da faixa (0 = primeiro dia da semana). */
  coluna: number;
  /** Quantos dias (colunas) a faixa ocupa nesta semana. */
  dias: number;
  /** Linha em que a faixa empilha (0 = a de cima); simultâneos ficam em linhas diferentes. */
  linha: number;
  /** O evento começou antes desta semana: a faixa é continuação. */
  comecaAntes: boolean;
  /** O evento segue na semana seguinte. */
  continuaDepois: boolean;
};

/**
 * Faixas dos itens que caem na semana, já empilhadas: cada uma vai para a linha mais alta que estiver livre
 * nos dias dela. Quem começa antes escolhe primeiro; no empate, o mais longo e depois a ordem recebida.
 * @param semana dias seguidos (AAAA-MM-DD), em ordem.
 */
export function faixasDaSemana<Item extends Pick<EventoNoCalendario, "dataInicio" | "dataFim">>(
  semana: string[],
  itens: Item[],
): FaixaDaSemana<Item>[] {
  const primeiro = semana[0];
  const ultimo = semana.at(-1);
  if (primeiro === undefined || ultimo === undefined) return [];

  const faixas = itens
    .filter((item) => item.dataInicio <= ultimo && item.dataFim >= primeiro && item.dataInicio <= item.dataFim)
    .map((item) => {
      const comecaAntes = item.dataInicio < primeiro;
      const continuaDepois = item.dataFim > ultimo;
      const coluna = comecaAntes ? 0 : semana.indexOf(item.dataInicio);
      const ultimaColuna = continuaDepois ? semana.length - 1 : semana.indexOf(item.dataFim);
      return { item, coluna, dias: ultimaColuna - coluna + 1, linha: 0, comecaAntes, continuaDepois };
    })
    // Array.sort é estável: no empate vale a ordem recebida.
    .sort((a, b) => a.coluna - b.coluna || b.dias - a.dias);

  // Para cada linha, a primeira coluna ainda livre.
  const livreAPartirDe: number[] = [];
  for (const faixa of faixas) {
    const livre = livreAPartirDe.findIndex((coluna) => coluna <= faixa.coluna);
    faixa.linha = livre === -1 ? livreAPartirDe.length : livre;
    livreAPartirDe[faixa.linha] = faixa.coluna + faixa.dias;
  }
  return faixas.sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
}

export function ocorreNoDia(evento: Pick<EventoNoCalendario, "dataInicio" | "dataFim">, dia: string): boolean {
  return evento.dataInicio <= dia && dia <= evento.dataFim;
}

export function situacaoNoCalendario(evento: Pick<EventoNoCalendario, "status" | "statusEscala">): SituacaoNoCalendario {
  if (evento.status === "CANCELADO") return "CANCELADO";
  switch (evento.statusEscala) {
    case "APROVADA":
    case "COMUNICADA":
      return evento.statusEscala;
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "AGUARDANDO_APROVACAO":
    case "DEVOLVIDA":
      return evento.status === "CONCLUIDO" ? "CONCLUIDO" : evento.statusEscala;
    default: {
      const desconhecido: never = evento.statusEscala;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Escala que o time ainda monta (não está com a líder nem aprovada). */
export function escalaEmMontagem(status: StatusEscala): boolean {
  switch (status) {
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "DEVOLVIDA":
      return true;
    case "AGUARDANDO_APROVACAO":
    case "APROVADA":
    case "COMUNICADA":
      return false;
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

export type Pendencias = {
  /** Eventos (sem Masterclass) nos próximos dias com a escala ainda não aprovada. */
  escalasAMontar: EventoNoCalendario[];
  /** Eventos (sem Masterclass) sem código: edição ou polo faltando no IAM Control. */
  semCodigo: EventoNoCalendario[];
};

export const DIAS_PARA_MONTAR_ESCALA = 30;

/** @param eventos eventos de hoje em diante; os cancelados e os já concluídos são descartados aqui. */
export function pendenciasDosEventos(eventos: EventoNoCalendario[], hoje: string): Pendencias {
  const limiteEscala = somarDias(hoje, DIAS_PARA_MONTAR_ESCALA);
  const ativos = eventos.filter((evento) => evento.status !== "CANCELADO" && evento.dataFim >= hoje && !ehMasterclass(evento));
  const escalaAberta = (evento: EventoNoCalendario) => escalaEmMontagem(evento.statusEscala);

  return {
    escalasAMontar: ativos.filter((evento) => evento.dataInicio <= limiteEscala && escalaAberta(evento)),
    semCodigo: ativos.filter((evento) => evento.codigo === null),
  };
}
