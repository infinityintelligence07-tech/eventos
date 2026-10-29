import { compilarFormula, type Expressao, FormulaInvalidaError } from "./formula";
import { compilarRegraVagas, type FuncaoCompilada, RegraVagasInvalidaError } from "./vagas";

// Regra de vagas em linguagem simples para Configurações › Vagas (docs/08 §12.2): nada de fórmula digitada.
// Cada função tem um "como calcular"; a regra gravada em tipo_evento.regra_vagas sai daqui.
// Fórmula antiga que não cabe num modo guiado fica PERSONALIZADA: aparece em texto e só pode ser mantida.

export type ModoDaVaga = "FIXO" | "POR_PUBLICO" | "POR_FILA" | "POR_FUNCAO" | "DIGITADO" | "PERSONALIZADA";

export type LinhaGuiada =
  | { funcao: string; modo: "FIXO"; quantidade: number }
  | { funcao: string; modo: "POR_PUBLICO" | "POR_FILA"; cada: number }
  | { funcao: string; modo: "POR_FUNCAO"; multiplicador: number; base: string }
  | { funcao: string; modo: "DIGITADO" }
  | { funcao: string; modo: "PERSONALIZADA"; formula: string };

type RegraFuncaoJson = { funcao: string; fixo: number } | { funcao: string; formula: string } | { funcao: string; digitado: true };

const VARIAVEL_DO_MODO = { POR_PUBLICO: "expectativa_publico", POR_FILA: "pessoas_na_fila" } as const;

const numero = (expressao: Expressao): number | null => (expressao.tipo === "numero" ? expressao.valor : null);
const variavel = (expressao: Expressao): string | null => (expressao.tipo === "variavel" ? expressao.nome : null);

/** "ceil(v / n)" ou "ceil(v * a / b)" → { v, cada } com `cada` inteiro positivo. */
function umACada(expressao: Expressao): { nome: string; cada: number } | null {
  if (expressao.tipo !== "funcao" || expressao.nome !== "ceil" || expressao.argumentos.length !== 1) return null;
  const divisao = expressao.argumentos[0]!;
  if (divisao.tipo !== "binaria" || divisao.operador !== "/") return null;
  const divisor = numero(divisao.direita);
  if (divisor === null || divisor <= 0) return null;

  const direto = variavel(divisao.esquerda);
  if (direto) return Number.isInteger(divisor) ? { nome: direto, cada: divisor } : null;

  const produto = divisao.esquerda;
  if (produto.tipo !== "binaria" || produto.operador !== "*") return null;
  const nome = variavel(produto.esquerda) ?? variavel(produto.direita);
  const fator = numero(produto.direita) ?? numero(produto.esquerda);
  if (!nome || fator === null || fator <= 0) return null;
  const cada = Math.round((divisor / fator) * 1e9) / 1e9;
  return Number.isInteger(cada) ? { nome, cada } : null;
}

/** "k * FUNCAO" (ou "FUNCAO * k"). */
function proporcional(expressao: Expressao): { base: string; multiplicador: number } | null {
  if (expressao.tipo !== "binaria" || expressao.operador !== "*") return null;
  const base = variavel(expressao.direita) ?? variavel(expressao.esquerda);
  const multiplicador = numero(expressao.esquerda) ?? numero(expressao.direita);
  if (!base || multiplicador === null || !Number.isInteger(multiplicador) || multiplicador <= 0) return null;
  return { base, multiplicador };
}

function linhaDaFormula(funcao: string, formula: string, funcoesAnteriores: ReadonlySet<string>): LinhaGuiada {
  let expressao: Expressao;
  try {
    expressao = compilarFormula(formula);
  } catch (cause: unknown) {
    if (cause instanceof FormulaInvalidaError) return { funcao, modo: "PERSONALIZADA", formula };
    throw cause;
  }
  const cada = umACada(expressao);
  if (cada?.nome === VARIAVEL_DO_MODO.POR_PUBLICO) return { funcao, modo: "POR_PUBLICO", cada: cada.cada };
  if (cada?.nome === VARIAVEL_DO_MODO.POR_FILA) return { funcao, modo: "POR_FILA", cada: cada.cada };
  const proporcao = proporcional(expressao);
  if (proporcao && funcoesAnteriores.has(proporcao.base)) return { funcao, modo: "POR_FUNCAO", ...proporcao };
  return { funcao, modo: "PERSONALIZADA", formula };
}

/** Regra gravada → linhas do formulário guiado. Lança RegraVagasInvalidaError se a regra do banco for inválida. */
export function lerRegraGuiada(regra: unknown): LinhaGuiada[] {
  const compiladas: FuncaoCompilada[] = compilarRegraVagas(regra);
  const bruta = (regra ?? {}) as { funcoes?: RegraFuncaoJson[] };
  const anteriores = new Set<string>();
  return compiladas.map((compilada, indice): LinhaGuiada => {
    const original = bruta.funcoes?.[indice];
    let linha: LinhaGuiada;
    if ("fixo" in compilada) linha = { funcao: compilada.funcao, modo: "FIXO", quantidade: compilada.fixo };
    else if ("digitado" in compilada) linha = { funcao: compilada.funcao, modo: "DIGITADO" };
    else linha = linhaDaFormula(compilada.funcao, original && "formula" in original ? original.formula : "", anteriores);
    anteriores.add(compilada.funcao);
    return linha;
  });
}

function jsonDaLinha(linha: LinhaGuiada): RegraFuncaoJson {
  switch (linha.modo) {
    case "FIXO":
      return { funcao: linha.funcao, fixo: linha.quantidade };
    case "POR_PUBLICO":
    case "POR_FILA":
      return { funcao: linha.funcao, formula: `ceil(${VARIAVEL_DO_MODO[linha.modo]} / ${linha.cada})` };
    case "POR_FUNCAO":
      return { funcao: linha.funcao, formula: `${linha.multiplicador} * ${linha.base}` };
    case "DIGITADO":
      return { funcao: linha.funcao, digitado: true };
    case "PERSONALIZADA":
      return { funcao: linha.funcao, formula: linha.formula };
    default: {
      const desconhecida: never = linha;
      throw new Error(`modo desconhecido: ${JSON.stringify(desconhecida)}`);
    }
  }
}

/** Linhas do formulário → JSON de tipo_evento.regra_vagas, validado pelo mesmo compilador do cálculo. */
export function regraDasLinhas(linhas: readonly LinhaGuiada[]): { funcoes: RegraFuncaoJson[] } {
  const repetidas = linhas.map((linha) => linha.funcao).filter((funcao, indice, todas) => todas.indexOf(funcao) !== indice);
  if (repetidas.length > 0) throw new RegraVagasInvalidaError([`função repetida: ${[...new Set(repetidas)].join(", ")}`]);
  const regra = { funcoes: linhas.map(jsonDaLinha) };
  compilarRegraVagas(regra);
  return regra;
}

/** Texto da doc 08 §12.2 ("Staff líder: 1 a cada 25 pessoas do público, arredondando para cima"). */
export function descreverLinha(linha: LinhaGuiada, nomeDaFuncao: (codigo: string) => string): string {
  switch (linha.modo) {
    case "FIXO":
      return `${linha.quantidade} fixo${linha.quantidade === 1 ? "" : "s"}`;
    case "POR_PUBLICO":
      return `1 a cada ${linha.cada} pessoas do público, arredondando para cima`;
    case "POR_FILA":
      return `1 a cada ${linha.cada} pessoas na fila, arredondando para cima`;
    case "POR_FUNCAO":
      return `${linha.multiplicador} para cada vaga de ${nomeDaFuncao(linha.base)}`;
    case "DIGITADO":
      return "definido em cada evento";
    case "PERSONALIZADA":
      return `cálculo personalizado (${linha.formula})`;
    default: {
      const desconhecida: never = linha;
      throw new Error(`modo desconhecido: ${JSON.stringify(desconhecida)}`);
    }
  }
}
