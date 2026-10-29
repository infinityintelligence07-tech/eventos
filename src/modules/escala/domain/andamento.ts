import type { StatusEscala } from "./convite";
import type { ResumoDaMontagem } from "./montagem";

// Andamento do evento no Resumo (docs/08 §5): Vagas → Escala → Aprovação → Comunicação → Logística → Custos.
// Logística e Custos são de outras abas: aqui só aparecem como etapa, sem situação calculada.

export type SituacaoDaEtapa = "FEITA" | "EM_ANDAMENTO" | "NAO_COMECOU" | "PENDENCIA";

export type Etapa = { chave: "vagas" | "escala" | "aprovacao" | "comunicacao" | "logistica" | "custos"; nome: string; situacao: SituacaoDaEtapa; detalhe: string };

export type ProximoPasso = { rotulo: "Montar escala" | "Continuar escala" | "Ver aprovação" | "Ir para Comunicação" | "Ver escala"; aba: "escala" | "comunicacao" };

function etapaDasVagas(resumo: ResumoDaMontagem): Etapa {
  const base = { chave: "vagas", nome: "Vagas" } as const;
  const semConfirmar = resumo.linhas.filter((linha) => !linha.confirmada).length;
  if (resumo.pendencias.some((pendencia) => pendencia.motivo !== "DIGITAR")) {
    return { ...base, situacao: "PENDENCIA", detalhe: `Falta dado para calcular: ${resumo.pendencias.map((item) => item.nomeDaFuncao).join(", ")}` };
  }
  if (resumo.linhas.length === 0 && resumo.pendencias.length === 0) return { ...base, situacao: "NAO_COMECOU", detalhe: "Sem vagas ainda" };
  if (semConfirmar === 0 && resumo.pendencias.length === 0) return { ...base, situacao: "FEITA", detalhe: `${resumo.vagas} vagas confirmadas` };
  const faltam = semConfirmar + resumo.pendencias.length;
  return { ...base, situacao: "EM_ANDAMENTO", detalhe: `${faltam} ${faltam === 1 ? "função sem número confirmado" : "funções sem número confirmado"}` };
}

function etapaDaEscala(resumo: ResumoDaMontagem): Etapa {
  const base = { chave: "escala", nome: "Escala", detalhe: `${resumo.preenchidas} de ${resumo.vagas} vagas` } as const;
  if (resumo.vagas === 0) return { ...base, situacao: "NAO_COMECOU" };
  if (resumo.vagasAbertas === 0) return { ...base, situacao: "FEITA" };
  return { ...base, situacao: resumo.preenchidas > 0 ? "EM_ANDAMENTO" : "NAO_COMECOU" };
}

function etapaDaAprovacao(status: StatusEscala, aprovadaEm: string | null): Etapa {
  const base = { chave: "aprovacao", nome: "Aprovação" } as const;
  switch (status) {
    case "SEM_ESCALA":
    case "RASCUNHO":
      return { ...base, situacao: "NAO_COMECOU", detalhe: "Não enviada" };
    case "AGUARDANDO_APROVACAO":
      return { ...base, situacao: "EM_ANDAMENTO", detalhe: "Com a líder" };
    case "DEVOLVIDA":
      return { ...base, situacao: "PENDENCIA", detalhe: "Devolvida para ajustar" };
    case "APROVADA":
    case "COMUNICADA":
      return { ...base, situacao: "FEITA", detalhe: aprovadaEm ? `Aprovada em ${aprovadaEm}` : "Aprovada" };
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

function etapaDaComunicacao(status: StatusEscala): Etapa {
  const base = { chave: "comunicacao", nome: "Comunicação" } as const;
  switch (status) {
    case "COMUNICADA":
      return { ...base, situacao: "FEITA", detalhe: "Copys enviadas" };
    case "APROVADA":
      return { ...base, situacao: "EM_ANDAMENTO", detalhe: "Copys a enviar" };
    case "SEM_ESCALA":
    case "RASCUNHO":
    case "AGUARDANDO_APROVACAO":
    case "DEVOLVIDA":
      return { ...base, situacao: "NAO_COMECOU", detalhe: "Depois da aprovação" };
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

export function proximoPasso(status: StatusEscala): ProximoPasso {
  switch (status) {
    case "SEM_ESCALA":
      return { rotulo: "Montar escala", aba: "escala" };
    case "RASCUNHO":
    case "DEVOLVIDA":
      return { rotulo: "Continuar escala", aba: "escala" };
    case "AGUARDANDO_APROVACAO":
      return { rotulo: "Ver aprovação", aba: "escala" };
    case "APROVADA":
      return { rotulo: "Ir para Comunicação", aba: "comunicacao" };
    case "COMUNICADA":
      return { rotulo: "Ver escala", aba: "escala" };
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** @param aprovadaEm data já formatada (dd/mm), quando houver. */
export function andamentoDoEvento(status: StatusEscala, resumo: ResumoDaMontagem, aprovadaEm: string | null): Etapa[] {
  return [
    etapaDasVagas(resumo),
    etapaDaEscala(resumo),
    etapaDaAprovacao(status, aprovadaEm),
    etapaDaComunicacao(status),
    { chave: "logistica", nome: "Logística", situacao: "NAO_COMECOU", detalhe: "Veja a aba Logística" },
    { chave: "custos", nome: "Custos", situacao: "NAO_COMECOU", detalhe: "Veja a aba Custos" },
  ];
}
