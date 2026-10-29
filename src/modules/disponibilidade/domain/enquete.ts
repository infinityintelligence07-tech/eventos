import { dataHoraLocal, diaEHora, diaEmSaoPaulo, periodoCurto, somarDias } from "./tempo";

// Enquete de disponibilidade (docs/07 §6.4, doc 08 §8). Aberta = fecha_em no futuro; não há coluna de status.
// Depois de encerrada o time ainda pode registrar respostas (ficam marcadas como fora do prazo).

export type SituacaoDaEnquete = "ABERTA" | "ENCERRADA";

export function situacaoDaEnquete(fechaEm: Date, agora: Date): SituacaoDaEnquete {
  return fechaEm.getTime() > agora.getTime() ? "ABERTA" : "ENCERRADA";
}

export function rotuloDaSituacaoDaEnquete(situacao: SituacaoDaEnquete): string {
  switch (situacao) {
    case "ABERTA":
      return "Aberta";
    case "ENCERRADA":
      return "Encerrada";
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de enquete desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** O Início avisa das enquetes abertas que fecham em até 3 dias (docs/07 §7.3). */
export const DIAS_PARA_AVISAR_FECHAMENTO = 3;

export function fechaEmBreve(fechaEm: Date, agora: Date, dias = DIAS_PARA_AVISAR_FECHAMENTO): boolean {
  const limite = agora.getTime() + dias * 24 * 60 * 60 * 1000;
  return situacaoDaEnquete(fechaEm, agora) === "ABERTA" && fechaEm.getTime() <= limite;
}

/** Padrão do "Fecha em": 7 dias a partir de hoje, às 23:59 (horário de São Paulo), no formato do campo. */
export function fechaEmPadrao(agora: Date): string {
  return `${somarDias(diaEmSaoPaulo(agora), 7)}T23:59`;
}

/** Fecha em no formato do campo datetime-local, a partir do instante gravado. */
export function fechaEmNoCampo(fechaEm: Date): string {
  return dataHoraLocal(fechaEm);
}

/** "Eventos de 01/12 a 31/12" — preenchido sozinho a partir do período, editável. */
export function tituloSugerido(de: string, ate: string): string {
  return `Eventos de ${periodoCurto(de, ate)}`;
}

/** Período padrão da Nova enquete: de hoje a 60 dias. */
export function periodoPadrao(agora: Date): { de: string; ate: string } {
  const hoje = diaEmSaoPaulo(agora);
  return { de: hoje, ate: somarDias(hoje, 60) };
}

export type EventoDoConvite = { codigo: string | null; nome: string; dataInicio: string; dataFim: string };

/** Texto pronto para colar no grupo do staff (só copiar; o WhatsApp fica para depois). */
export function textoDoConvite({ titulo, fechaEm, eventos }: { titulo: string; fechaEm: Date; eventos: EventoDoConvite[] }): string {
  const linhas = eventos.map((evento) => {
    const nome = evento.codigo ? `${evento.codigo} · ${evento.nome}` : evento.nome;
    return `• ${nome} · ${periodoCurto(evento.dataInicio, evento.dataFim)}`;
  });
  return [
    `*${titulo}*`,
    "Em quais destes eventos você pode trabalhar?",
    "",
    ...linhas,
    "",
    `Responda com os eventos em que você pode até ${diaEHora(fechaEm)}.`,
  ].join("\n");
}

/** "fecha 15/11 às 23:59" / "fechou 15/11 às 23:59" */
export function descricaoDoFechamento(fechaEm: Date, agora: Date): string {
  return `${situacaoDaEnquete(fechaEm, agora) === "ABERTA" ? "Fecha em" : "Encerrada em"} ${diaEHora(fechaEm)}`;
}

/** A enquete não existe. O fluxo traduz para "Enquete não encontrada.". */
export class EnqueteNaoEncontradaError extends Error {
  constructor(readonly enqueteId: string) {
    super(`enquete ${enqueteId} não encontrada`);
    this.name = "EnqueteNaoEncontradaError";
  }
}

/** Encerrar uma enquete que já fechou. */
export class EnqueteJaEncerradaError extends Error {
  constructor(readonly enqueteId: string) {
    super(`enquete ${enqueteId} já encerrada`);
    this.name = "EnqueteJaEncerradaError";
  }
}

/** "Fecha em" no passado ao abrir ou reabrir. */
export class FechamentoNoPassadoError extends Error {
  constructor() {
    super("fecha_em no passado");
    this.name = "FechamentoNoPassadoError";
  }
}

/** Algum evento escolhido não existe (ou foi apagado) ao abrir a enquete. */
export class EventoInexistenteError extends Error {
  constructor(readonly eventoIds: string[]) {
    super(`eventos inexistentes: ${eventoIds.join(", ")}`);
    this.name = "EventoInexistenteError";
  }
}
