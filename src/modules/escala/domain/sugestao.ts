// Ordem das pessoas sugeridas para uma vaga (docs/07 §6.2, docs/04 "Respostas do Vitor"):
// disponibilidade → [desempenho, quando existir] → função habilitada → distância (faixas de 50 km) → rodízio.
// A ordem é lexicográfica; a pontuação só explica a sugestão (convocacao.sugestao_score).

export type Disponibilidade = "PODE" | "SEM_RESPOSTA" | "NAO_PODE";
export type NivelNaFuncao = "HABILITADO" | "TRAINEE" | "SEM_FUNCAO";

export type Candidato = {
  pessoaId: string;
  nome: string;
  disponibilidade: Disponibilidade;
  nivel: NivelNaFuncao;
  distanciaKm: number | null;
  convocacoesUltimos90Dias: number;
  /** Nulo = nunca trabalhou ou faz mais de 90 dias. */
  diasDesdeUltima: number | null;
  /** Já ativa em outra linha deste evento: não entra na lista. */
  jaNoEvento: boolean;
  /** Ativa num evento com datas sobrepostas (código do evento). Aparece, com aviso. */
  conflitos: string[];
};

export const FAIXA_DE_DISTANCIA_KM = 50;

function pesoDaDisponibilidade(disponibilidade: Disponibilidade): number {
  switch (disponibilidade) {
    case "PODE":
      return 0;
    case "SEM_RESPOSTA":
      return 1;
    case "NAO_PODE":
      return 2;
    default: {
      const desconhecida: never = disponibilidade;
      throw new Error(`disponibilidade desconhecida: ${String(desconhecida)}`);
    }
  }
}

function pesoDoNivel(nivel: NivelNaFuncao): number {
  switch (nivel) {
    case "HABILITADO":
      return 0;
    case "TRAINEE":
      return 1;
    case "SEM_FUNCAO":
      return 2;
    default: {
      const desconhecido: never = nivel;
      throw new Error(`nível desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Sem coordenada vai para o fim da fila de distância. */
function faixaDeDistancia(km: number | null): number {
  return km === null ? Number.POSITIVE_INFINITY : Math.floor(km / FAIXA_DE_DISTANCIA_KM);
}

/** Quem nunca trabalhou (ou há mais de 90 dias) vem antes de quem trabalhou há pouco. */
function tempoParado(dias: number | null): number {
  return dias === null ? Number.POSITIVE_INFINITY : dias;
}

export function compararCandidatos(a: Candidato, b: Candidato): number {
  return (
    pesoDaDisponibilidade(a.disponibilidade) - pesoDaDisponibilidade(b.disponibilidade) ||
    // Desempenho entra aqui quando o rastreio existir.
    pesoDoNivel(a.nivel) - pesoDoNivel(b.nivel) ||
    diferenca(faixaDeDistancia(a.distanciaKm), faixaDeDistancia(b.distanciaKm)) ||
    a.convocacoesUltimos90Dias - b.convocacoesUltimos90Dias ||
    diferenca(tempoParado(b.diasDesdeUltima), tempoParado(a.diasDesdeUltima)) ||
    a.nome.localeCompare(b.nome, "pt-BR")
  );
}

function diferenca(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 0 a 100: disponibilidade 40, função 30, distância 20, rodízio 10. Só para explicar. */
export function pontuacaoDaSugestao(candidato: Candidato): number {
  const disponibilidade = [40, 20, 0][pesoDaDisponibilidade(candidato.disponibilidade)]!;
  const funcao = [30, 15, 0][pesoDoNivel(candidato.nivel)]!;
  const faixa = faixaDeDistancia(candidato.distanciaKm);
  const distancia = Number.isFinite(faixa) ? Math.max(0, 20 - faixa * 4) : 0;
  const rodizio = Math.max(0, 10 - candidato.convocacoesUltimos90Dias * 2);
  return disponibilidade + funcao + distancia + rodizio;
}

export type Sugestoes = { sugeridos: Candidato[]; naoPodem: Candidato[] };

/** Tira quem já está no evento; "não pode" vai para um grupo à parte (pede confirmação para adicionar). */
export function ordenarSugestoes(candidatos: readonly Candidato[]): Sugestoes {
  const ordenados = candidatos.filter((candidato) => !candidato.jaNoEvento).sort(compararCandidatos);
  return {
    sugeridos: ordenados.filter((candidato) => candidato.disponibilidade !== "NAO_PODE"),
    naoPodem: ordenados.filter((candidato) => candidato.disponibilidade === "NAO_PODE"),
  };
}
