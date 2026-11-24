import { diasEntre } from "./datas";

// Janela de compra de passagem (docs/07 §4.5 e §11.1). O aviso abre N dias antes do evento: N vem de
// Configurações › Aviso de voos (padrão 90, os "3 meses") e chega aqui por parâmetro, o domínio não lê o banco.

/** Padrão do aviso: 90 dias (3 meses) antes do evento. */
export const DIAS_ABRE_A_JANELA = 90;
/** Teto do "atrasado": com o aviso em 90 dias ou mais, o pedido atrasa a partir de D-60. */
export const DIAS_ATRASADO = 60;

export const DIAS_DO_AVISO_MINIMO = 7;
export const DIAS_DO_AVISO_MAXIMO = 365;

/** Chave em eventos.configuracao. Sem valor (ou com valor inválido) vale o padrão. */
export const CHAVE_DIAS_DO_AVISO_DE_VOOS = "dias_aviso_voos";

/** Valor guardado na configuração (texto) → dias do aviso. Vazio, não inteiro ou fora dos limites: o padrão. */
export function diasDoAvisoConfigurado(valor: string | null | undefined): number {
  if (!valor || !/^\d{1,3}$/.test(valor.trim())) return DIAS_ABRE_A_JANELA;
  const dias = Number(valor.trim());
  return dias >= DIAS_DO_AVISO_MINIMO && dias <= DIAS_DO_AVISO_MAXIMO ? dias : DIAS_ABRE_A_JANELA;
}

/**
 * A partir de quantos dias o pedido conta como atrasado. Acompanha o aviso para sempre sobrar um trecho "na janela":
 * dois terços do aviso, no máximo 60 dias (aviso de 90 ou mais → 60; de 45 → 30; de 30 → 20).
 */
export function diasDoAtraso(diasDoAviso: number): number {
  return Math.min(DIAS_ATRASADO, Math.floor((diasDoAviso * 2) / 3));
}

export type JanelaDeCompra = "FORA_DA_JANELA" | "NA_JANELA" | "ATRASADO";

export function janelaDeCompra(dataDoEvento: string, hoje: string, diasDoAviso: number = DIAS_ABRE_A_JANELA): { janela: JanelaDeCompra; dias: number } {
  const dias = diasEntre(hoje, dataDoEvento);
  if (dias > diasDoAviso) return { janela: "FORA_DA_JANELA", dias };
  if (dias > diasDoAtraso(diasDoAviso)) return { janela: "NA_JANELA", dias };
  return { janela: "ATRASADO", dias };
}

/** Na janela ou atrasado: já devia ter pedido. */
export function precisaPedir(janela: JanelaDeCompra): boolean {
  switch (janela) {
    case "NA_JANELA":
    case "ATRASADO":
      return true;
    case "FORA_DA_JANELA":
      return false;
    default: {
      const desconhecida: never = janela;
      throw new Error(`janela desconhecida: ${String(desconhecida)}`);
    }
  }
}

export type EventoComPassagensAPedir = {
  eventoId: string;
  codigo: string | null;
  nome: string;
  dataInicio: string;
  /** Pessoas que vão de avião e ainda não têm pedido ativo. */
  passagens: number;
  janela: Exclude<JanelaDeCompra, "FORA_DA_JANELA">;
  /** Dias até o evento. */
  dias: number;
};

/**
 * O aviso da tela (Início e Voos): eventos que já entraram na janela e ainda têm passagem a pedir, o mais próximo
 * primeiro. Recebe uma linha por passagem a pedir.
 */
export function eventosComPassagensAPedir(
  aPedir: { evento: { id: string; codigo: string | null; nome: string; dataInicio: string } }[],
  hoje: string,
  diasDoAviso: number = DIAS_ABRE_A_JANELA,
): EventoComPassagensAPedir[] {
  const porEvento = new Map<string, EventoComPassagensAPedir>();
  for (const { evento } of aPedir) {
    const existente = porEvento.get(evento.id);
    if (existente) {
      existente.passagens += 1;
      continue;
    }
    const { janela, dias } = janelaDeCompra(evento.dataInicio, hoje, diasDoAviso);
    if (janela === "FORA_DA_JANELA") continue;
    porEvento.set(evento.id, { eventoId: evento.id, codigo: evento.codigo, nome: evento.nome, dataInicio: evento.dataInicio, passagens: 1, janela, dias });
  }
  return [...porEvento.values()].sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "faltam 12 dias", "falta 1 dia", "é hoje". */
export function textoDosDiasQueFaltam(dias: number): string {
  if (dias <= 0) return "é hoje";
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

/** "4 passagens a pedir" / "1 passagem a pedir". */
export function textoDasPassagensAPedir(passagens: number): string {
  return passagens === 1 ? "1 passagem a pedir" : `${passagens} passagens a pedir`;
}
