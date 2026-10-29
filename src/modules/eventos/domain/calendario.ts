import type { StatusEvento } from "./turma";

// Calendário do time de eventos: o mês em semanas (domingo a sábado), a situação de cada evento
// para a cor e o que precisa de ação. Datas são texto AAAA-MM-DD no fuso de São Paulo.

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

/** Semanas de domingo a sábado que cobrem o mês inteiro. */
export function semanasDoMes(mes: Mes): string[][] {
  const inicio = primeiroDia(mes);
  const domingo = somarDias(inicio, -paraUtc(inicio).getUTCDay());
  const fim = ultimoDia(mes);
  const semanas: string[][] = [];
  for (let semana = domingo; semana <= fim; semana = somarDias(semana, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, dia) => somarDias(semana, dia)));
  }
  return semanas;
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
  /** Confronto sem o número de pessoas na fila: pai e mãe não são calculados. */
  confrontoSemFila: EventoNoCalendario[];
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
    confrontoSemFila: ativos.filter((evento) => evento.tipoSigla === "CONF" && evento.pessoasNaFila === null && escalaAberta(evento)),
    escalasAMontar: ativos.filter((evento) => evento.dataInicio <= limiteEscala && escalaAberta(evento)),
    semCodigo: ativos.filter((evento) => evento.codigo === null),
  };
}
