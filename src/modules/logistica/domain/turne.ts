// Voo de Masterclass e data real (docs/07 §4.7).
//
// Turnê: na Masterclass a pessoa vai para a PRIMEIRA palestra e volta da ÚLTIMA, passando por várias no meio. O menor
// modelo que representa isso: o pedido de voo continua sendo de um evento (a primeira palestra, onde a ida chega) e
// ganha um "evento da volta" opcional (a última palestra, de onde a volta sai). Uma palestra só = sem evento da volta.
//
// Data real: a solicitação e a compra têm o dia em que de fato aconteceram, informado por quem lança (compra antiga da
// planilha, compra feita fora do sistema). Por padrão, hoje. O histórico guarda sempre a hora real do lançamento.

export type EventoDaTurne = { id: string; dataInicio: string; masterclass: boolean; cancelado: boolean };

export type RecusaDaTurne = "IDA_NAO_E_MASTERCLASS" | "VOLTA_NAO_E_MASTERCLASS" | "VOLTA_CANCELADA" | "VOLTA_ANTES_DA_IDA";

/**
 * `volta` nulo ou a mesma palestra = viagem de um evento só (não grava evento da volta). Com outra palestra na volta,
 * as duas pontas precisam ser Masterclass e a última não pode vir antes da primeira nem estar cancelada.
 */
export function validarTurne(ida: EventoDaTurne, volta: EventoDaTurne | null): { ok: true; eventoVoltaId: string | null } | { ok: false; motivo: RecusaDaTurne } {
  if (!volta || volta.id === ida.id) return { ok: true, eventoVoltaId: null };
  if (!ida.masterclass) return { ok: false, motivo: "IDA_NAO_E_MASTERCLASS" };
  if (!volta.masterclass) return { ok: false, motivo: "VOLTA_NAO_E_MASTERCLASS" };
  if (volta.cancelado) return { ok: false, motivo: "VOLTA_CANCELADA" };
  if (volta.dataInicio < ida.dataInicio) return { ok: false, motivo: "VOLTA_ANTES_DA_IDA" };
  return { ok: true, eventoVoltaId: volta.id };
}

export function mensagemDaRecusaDaTurne(motivo: RecusaDaTurne): string {
  switch (motivo) {
    case "IDA_NAO_E_MASTERCLASS":
      return "Só o voo de Masterclass tem a volta por outra palestra. Para um evento, a ida e a volta são do mesmo evento.";
    case "VOLTA_NAO_E_MASTERCLASS":
      return "A última palestra precisa ser uma Masterclass.";
    case "VOLTA_CANCELADA":
      return "A última palestra foi cancelada: escolha outra para a volta.";
    case "VOLTA_ANTES_DA_IDA":
      return "A última palestra não pode ser antes da primeira.";
    default: {
      const desconhecido: never = motivo;
      throw new Error(`recusa da turnê desconhecida: ${String(desconhecido)}`);
    }
  }
}

export type RecusaDaDataReal = "FUTURA" | "ANTES_DA_SOLICITACAO";

/**
 * A data de negócio de um lançamento (AAAA-MM-DD, fuso de São Paulo). Sem data informada vale hoje. Não aceita data
 * futura; com `naoAntesDe` (a data da solicitação), a compra não pode vir antes dela.
 */
export function dataRealDoLancamento({ informada, hoje, naoAntesDe }: { informada?: string | null; hoje: string; naoAntesDe?: string }): { ok: true; data: string } | { ok: false; motivo: RecusaDaDataReal } {
  const data = informada ?? hoje;
  if (data > hoje) return { ok: false, motivo: "FUTURA" };
  if (naoAntesDe !== undefined && data < naoAntesDe) return { ok: false, motivo: "ANTES_DA_SOLICITACAO" };
  return { ok: true, data };
}

/** "Hotel Central — Manaus (AM)": onde é a palestra (as colunas "Local 1ª palestra" e "Local última palestra" da planilha). */
export function localDaPalestra(evento: { localNome: string | null; cidade: string | null; uf: string | null; codigo: string | null; nome: string }): string {
  const cidade = evento.cidade && evento.uf ? `${evento.cidade} (${evento.uf})` : null;
  return [evento.localNome, cidade].filter(Boolean).join(" — ") || (evento.codigo ?? evento.nome);
}

/** Recorte das telas de Voos e de Hospedagem, como a planilha separa em abas: eventos de um lado, Masterclass do outro. */
export const RECORTES_DA_LOGISTICA = ["EVENTOS", "MASTERCLASS"] as const;
export type RecorteDaLogistica = (typeof RECORTES_DA_LOGISTICA)[number];

/** O parâmetro da URL (`?recorte=masterclass`); qualquer outra coisa é o recorte de eventos. */
export function recorteDaLogistica(parametro: string | null | undefined): RecorteDaLogistica {
  return parametro === "masterclass" ? "MASTERCLASS" : "EVENTOS";
}

export const noRecorte = (recorte: RecorteDaLogistica, evento: { masterclass: boolean }) => (recorte === "MASTERCLASS") === evento.masterclass;
