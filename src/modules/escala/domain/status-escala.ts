import type { StatusEscala } from "./convite";
import type { Pendencia } from "./vagas";

// Máquina de estado de evento.status_escala (docs/07 §4.1 e §11.1).
// Com a líder (AGUARDANDO_APROVACAO) a escala fica travada para quem monta; depois de aprovada,
// qualquer mudança de pessoas exige reabrir (volta para RASCUNHO) e aprovar de novo.

export type AcaoDaEscala = "ENVIAR" | "APROVAR" | "DEVOLVER" | "REABRIR";

export type TransicaoDaEscala = { para: StatusEscala } | { erro: "TRANSICAO_INVALIDA" };

export function transicaoDaEscala(atual: StatusEscala, acao: AcaoDaEscala): TransicaoDaEscala {
  const invalida: TransicaoDaEscala = { erro: "TRANSICAO_INVALIDA" };
  switch (acao) {
    case "ENVIAR":
      return atual === "RASCUNHO" || atual === "DEVOLVIDA" ? { para: "AGUARDANDO_APROVACAO" } : invalida;
    case "APROVAR":
      return atual === "AGUARDANDO_APROVACAO" ? { para: "APROVADA" } : invalida;
    case "DEVOLVER":
      return atual === "AGUARDANDO_APROVACAO" ? { para: "DEVOLVIDA" } : invalida;
    case "REABRIR":
      return atual === "APROVADA" || atual === "COMUNICADA" ? { para: "RASCUNHO" } : invalida;
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação de escala desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Nome da ação no registro_acao (CHECK ^[A-Z_]{3,40}$). */
export function acaoRegistrada(acao: AcaoDaEscala): string {
  switch (acao) {
    case "ENVIAR":
      return "ENVIADA_APROVACAO";
    case "APROVAR":
      return "APROVADA";
    case "DEVOLVER":
      return "DEVOLVIDA";
    case "REABRIR":
      return "REABERTA";
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação de escala desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Quem monta pode mexer em vagas e pessoas. SEM_ESCALA vira RASCUNHO na primeira mudança. */
export function escalaEditavel(status: StatusEscala): boolean {
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

/** Respostas do staff só existem depois que a escala foi aprovada (e a copy, enviada). */
export function aceitaResposta(status: StatusEscala): boolean {
  switch (status) {
    case "APROVADA":
    case "COMUNICADA":
      return true;
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "AGUARDANDO_APROVACAO":
    case "DEVOLVIDA":
      return false;
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Status do evento (IAM Control) que deixam a escala só para consulta. */
export function eventoEncerrado(statusDoEvento: string): boolean {
  return statusDoEvento === "CANCELADO" || statusDoEvento === "CONCLUIDO";
}

export type MotivoDaPendencia = "FALTA_FILA" | "FALTA_PUBLICO" | "DIGITAR";

export function motivoDaPendencia(pendencia: Pendencia): MotivoDaPendencia {
  if ("digitar" in pendencia) return "DIGITAR";
  return pendencia.variavel === "pessoas_na_fila" ? "FALTA_FILA" : "FALTA_PUBLICO";
}

export type LinhaParaEnvio = { funcao: string; nomeDaFuncao: string; quantidade: number; confirmada: boolean; ativas: number };

export type ConferenciaDoEnvio =
  | { pode: true; vagasAbertas: number }
  | { pode: false; motivos: string[]; funcoesSemConfirmacao: string[] };

/**
 * Pré-condições de "Enviar para aprovação": toda linha com número confirmado, nenhuma função da regra
 * esperando dado (fila do Confronto) ou número digitado. Vaga sem pessoa não impede (a líder vê o aviso).
 */
export function conferirEnvio(
  linhas: readonly LinhaParaEnvio[],
  pendencias: readonly { nomeDaFuncao: string; motivo: MotivoDaPendencia }[],
): ConferenciaDoEnvio {
  const motivos: string[] = [];
  const semConfirmacao = linhas.filter((linha) => !linha.confirmada).map((linha) => linha.nomeDaFuncao);
  if (linhas.length === 0 && pendencias.length === 0) motivos.push("Adicione ao menos uma função com vagas.");
  if (semConfirmacao.length > 0) motivos.push(`Confirme o número de vagas de: ${semConfirmacao.join(", ")}.`);

  for (const motivo of ["FALTA_FILA", "FALTA_PUBLICO", "DIGITAR"] as const) {
    const funcoes = pendencias.filter((pendencia) => pendencia.motivo === motivo).map((pendencia) => pendencia.nomeDaFuncao);
    if (funcoes.length === 0) continue;
    switch (motivo) {
      case "FALTA_FILA":
        motivos.push(`Informe as pessoas na fila para calcular: ${funcoes.join(", ")}.`);
        break;
      case "FALTA_PUBLICO":
        motivos.push(`Informe a expectativa de público para calcular: ${funcoes.join(", ")}.`);
        break;
      case "DIGITAR":
        motivos.push(`Digite e confirme o número de vagas de: ${funcoes.join(", ")}.`);
        break;
      default: {
        const desconhecido: never = motivo;
        throw new Error(`motivo desconhecido: ${String(desconhecido)}`);
      }
    }
  }

  if (motivos.length > 0) return { pode: false, motivos, funcoesSemConfirmacao: semConfirmacao };
  return { pode: true, vagasAbertas: linhas.reduce((soma, linha) => soma + Math.max(0, linha.quantidade - linha.ativas), 0) };
}
