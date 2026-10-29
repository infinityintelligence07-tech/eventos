import type { RegrasDoCalculo } from "./regras";

// Cálculo da solicitação de custo (docs/03-regras-de-custo.md). Dinheiro em centavos inteiros; km e consumo
// com uma casa decimal, contados em décimos para não arredondar em ponto flutuante.
//   combustível = km rodados ÷ consumo × preço do litro (ida e volta conta os dois trechos)
//   pedágio     = valor de um sentido, ×2 na ida e volta
//   depreciação = faixa dos km rodados, aplicada a cada deslocamento
//   custo por km = preço do litro ÷ consumo (o que o combustível custa por km rodado)

export type NivelDeExcecao = "NENHUM" | "ALERTA" | "CRITICO";

export type RegraDoAlerta = "CONSUMO_BAIXO" | "CONSUMO_ALTO" | "CUSTO_POR_KM";

export type AlertaDeCusto = { nivel: Exclude<NivelDeExcecao, "NENHUM">; regra: RegraDoAlerta; mensagem: string; resumo: string };

export type EntradaDoDeslocamento = {
  km: number;
  idaVolta: boolean;
  consumoKmL: number;
  precoLitroCentavos: number;
  pedagioCentavos: number;
};

export type DeslocamentoCalculado = {
  kmRodados: number;
  combustivelCentavos: number;
  pedagioCentavos: number;
  depreciacaoCentavos: number;
  totalCentavos: number;
  nivel: NivelDeExcecao;
  alertas: AlertaDeCusto[];
};

const UMA_CASA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ATE_UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const REAIS_COM_CASAS = [2, 3, 4].map((casas) => ({ casas, formato: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas }) }));

const decimos = (valor: number) => Math.round(valor * 10);

function reaisPorKm(centavos: number): string {
  return REAIS.format(Math.round(centavos) / 100);
}

/**
 * Custo por km que passou do limite: com as casas que mostram que passou. R$ 0,9523 vira "R$ 0,952", não
 * "R$ 0,95" (que leria "R$ 0,95 acima de R$ 0,95").
 */
function custoAcimaDoLimite(centavos: number, limiteCentavos: number): string {
  for (const { casas, formato } of REAIS_COM_CASAS) {
    const fator = 10 ** casas;
    if (Math.round((centavos / 100) * fator) > Math.round((limiteCentavos / 100) * fator)) return formato.format(Math.round((centavos / 100) * fator) / fator);
  }
  return REAIS_COM_CASAS.at(-1)!.formato.format(centavos / 100);
}

const PESO: Record<NivelDeExcecao, number> = { NENHUM: 0, ALERTA: 1, CRITICO: 2 };

export function piorNivel(niveis: NivelDeExcecao[]): NivelDeExcecao {
  return niveis.reduce<NivelDeExcecao>((pior, nivel) => (PESO[nivel] > PESO[pior] ? nivel : pior), "NENHUM");
}

/** Alertas do doc 03, um por medida (consumo, custo por km), sempre o mais grave. */
export function alertasDoConsumo(consumoKmL: number, precoLitroCentavos: number, limites: RegrasDoCalculo["limites"]): AlertaDeCusto[] {
  const alertas: AlertaDeCusto[] = [];
  const consumo = decimos(consumoKmL);
  const textoConsumo = UMA_CASA.format(consumo / 10);
  const abaixo = (limite: number | null) => limite !== null && consumo < decimos(limite);

  if (abaixo(limites.critico.kmLMin)) {
    alertas.push({ nivel: "CRITICO", regra: "CONSUMO_BAIXO", mensagem: `Consumo de ${textoConsumo} km/l está abaixo do limite de ${ATE_UMA_CASA.format(limites.critico.kmLMin!)} km/l.`, resumo: `consumo ${textoConsumo} km/l` });
  } else if (limites.critico.kmLMax !== null && consumo > decimos(limites.critico.kmLMax)) {
    alertas.push({ nivel: "CRITICO", regra: "CONSUMO_ALTO", mensagem: `Consumo de ${textoConsumo} km/l está acima do limite de ${ATE_UMA_CASA.format(limites.critico.kmLMax)} km/l.`, resumo: `consumo ${textoConsumo} km/l` });
  } else if (abaixo(limites.alerta.kmLMin)) {
    alertas.push({ nivel: "ALERTA", regra: "CONSUMO_BAIXO", mensagem: `Consumo de ${textoConsumo} km/l está abaixo do limite de ${ATE_UMA_CASA.format(limites.alerta.kmLMin!)} km/l.`, resumo: `consumo ${textoConsumo} km/l` });
  }

  if (consumo > 0) {
    const custoPorKm = (precoLitroCentavos * 10) / consumo;
    const acima = (nivel: "CRITICO" | "ALERTA", limite: number): AlertaDeCusto => {
      const valor = custoAcimaDoLimite(custoPorKm, limite);
      return { nivel, regra: "CUSTO_POR_KM", mensagem: `Custo de ${valor} por km está acima do limite de ${reaisPorKm(limite)}.`, resumo: `${valor}/km` };
    };
    if (limites.critico.custoKmMaxCentavos !== null && custoPorKm > limites.critico.custoKmMaxCentavos) {
      alertas.push(acima("CRITICO", limites.critico.custoKmMaxCentavos));
    } else if (limites.alerta.custoKmMaxCentavos !== null && custoPorKm > limites.alerta.custoKmMaxCentavos) {
      alertas.push(acima("ALERTA", limites.alerta.custoKmMaxCentavos));
    }
  }
  return alertas;
}

/** Faixa dos km rodados (limites inclusive); a de maior km mínimo quando duas valem. */
export function depreciacaoDaFaixa(kmRodados: number, faixas: RegrasDoCalculo["faixas"]): { regraId: string; valorCentavos: number } | null {
  const km = decimos(kmRodados);
  const faixa = faixas
    .filter((item) => km >= decimos(item.kmMin) && (item.kmMax === null || km <= decimos(item.kmMax)))
    .sort((a, b) => b.kmMin - a.kmMin)[0];
  return faixa ? { regraId: faixa.regraId, valorCentavos: faixa.valorCentavos } : null;
}

export function calcularDeslocamento(entrada: EntradaDoDeslocamento, regras: RegrasDoCalculo): DeslocamentoCalculado {
  const vezes = entrada.idaVolta ? 2 : 1;
  const kmRodadosDecimos = decimos(entrada.km) * vezes;
  const consumo = decimos(entrada.consumoKmL);
  const combustivelCentavos = consumo > 0 ? Math.round((kmRodadosDecimos * entrada.precoLitroCentavos) / consumo) : 0;
  const pedagioCentavos = entrada.pedagioCentavos * vezes;
  const kmRodados = kmRodadosDecimos / 10;
  const depreciacaoCentavos = depreciacaoDaFaixa(kmRodados, regras.faixas)?.valorCentavos ?? 0;
  const alertas = alertasDoConsumo(entrada.consumoKmL, entrada.precoLitroCentavos, regras.limites);
  return {
    kmRodados,
    combustivelCentavos,
    pedagioCentavos,
    depreciacaoCentavos,
    totalCentavos: combustivelCentavos + pedagioCentavos + depreciacaoCentavos,
    nivel: piorNivel(alertas.map((alerta) => alerta.nivel)),
    alertas,
  };
}

export type EntradaDoItem = { quantidade: number; valorCentavos: number };

/** Valor unitário × quantidade (até duas casas), em centavos. */
export function totalDoItem(item: EntradaDoItem): number {
  return Math.round((Math.round(item.quantidade * 100) * item.valorCentavos) / 100);
}

export type SolicitacaoCalculada = {
  deslocamentos: DeslocamentoCalculado[];
  itens: number[];
  kmTotal: number;
  totalCentavos: number;
  nivel: NivelDeExcecao;
};

/** O servidor recalcula tudo a partir do que foi digitado: não confia no total do navegador. */
export function calcularSolicitacao(
  entrada: { deslocamentos: EntradaDoDeslocamento[]; itens: EntradaDoItem[] },
  regras: RegrasDoCalculo,
): SolicitacaoCalculada {
  const deslocamentos = entrada.deslocamentos.map((deslocamento) => calcularDeslocamento(deslocamento, regras));
  const itens = entrada.itens.map(totalDoItem);
  const somaDecimos = deslocamentos.reduce((soma, deslocamento) => soma + decimos(deslocamento.kmRodados), 0);
  return {
    deslocamentos,
    itens,
    kmTotal: somaDecimos / 10,
    totalCentavos: deslocamentos.reduce((soma, deslocamento) => soma + deslocamento.totalCentavos, 0) + itens.reduce((soma, valor) => soma + valor, 0),
    nivel: piorNivel(deslocamentos.map((deslocamento) => deslocamento.nivel)),
  };
}

export function rotuloDoNivel(nivel: NivelDeExcecao): string | null {
  switch (nivel) {
    case "CRITICO":
      return "Crítico";
    case "ALERTA":
      return "Alerta";
    case "NENHUM":
      return null;
    default: {
      const desconhecido: never = nivel;
      throw new Error(`nível desconhecido: ${String(desconhecido)}`);
    }
  }
}
