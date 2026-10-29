// Avaliador das fórmulas de `tipo_evento.regra_vagas` ("ceil(expectativa_publico * 0.5 / 25)").
// Gramática fechada (números, variáveis, + - * /, parênteses, ceil/floor/round/max/min),
// sem eval: a fórmula vem do banco e é editável na tela de configurações.

export class FormulaInvalidaError extends Error {
  constructor(formula: string, motivo: string) {
    super(`Fórmula inválida "${formula}": ${motivo}`);
    this.name = "FormulaInvalidaError";
  }
}

export class DivisaoPorZeroError extends Error {
  constructor() {
    super("Divisão por zero na fórmula");
    this.name = "DivisaoPorZeroError";
  }
}

export class VariavelAusenteError extends Error {
  constructor(readonly variavel: string) {
    super(`Variável sem valor: ${variavel}`);
    this.name = "VariavelAusenteError";
  }
}

type Token =
  | { tipo: "numero"; valor: number }
  | { tipo: "nome"; valor: string }
  | { tipo: "simbolo"; valor: "+" | "-" | "*" | "/" | "(" | ")" | "," };

export type Expressao =
  | { tipo: "numero"; valor: number }
  | { tipo: "variavel"; nome: string }
  | { tipo: "negacao"; valor: Expressao }
  | { tipo: "binaria"; operador: "+" | "-" | "*" | "/"; esquerda: Expressao; direita: Expressao }
  | { tipo: "funcao"; nome: NomeFuncao; argumentos: Expressao[] };

// Corta o ruído de ponto flutuante antes de arredondar: ceil(0.1 * 3 * 10) deve dar 3, não 4.
const semRuido = (valor: number): number => Math.round(valor * 1e9) / 1e9;

const FUNCOES = {
  ceil: { aridade: [1, 1], aplicar: (a: number[]) => Math.ceil(semRuido(a[0]!)) },
  floor: { aridade: [1, 1], aplicar: (a: number[]) => Math.floor(semRuido(a[0]!)) },
  round: { aridade: [1, 1], aplicar: (a: number[]) => Math.round(a[0]!) },
  max: { aridade: [1, Infinity], aplicar: (a: number[]) => Math.max(...a) },
  min: { aridade: [1, Infinity], aplicar: (a: number[]) => Math.min(...a) },
} as const;

type NomeFuncao = keyof typeof FUNCOES;

function ehNomeFuncao(nome: string): nome is NomeFuncao {
  return Object.hasOwn(FUNCOES, nome);
}

function tokenizar(formula: string): Token[] {
  const tokens: Token[] = [];
  const padrao = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/(),]))/y;
  let posicao = 0;

  while (posicao < formula.length) {
    if (formula.slice(posicao).trim() === "") {
      break;
    }
    padrao.lastIndex = posicao;
    const encontrado = padrao.exec(formula);
    if (!encontrado) {
      throw new FormulaInvalidaError(formula, `caractere inesperado na posição ${posicao + 1}`);
    }
    const [, numero, nome, simbolo] = encontrado;
    if (numero !== undefined) {
      tokens.push({ tipo: "numero", valor: Number(numero) });
    } else if (nome !== undefined) {
      tokens.push({ tipo: "nome", valor: nome });
    } else {
      tokens.push({ tipo: "simbolo", valor: simbolo as "+" });
    }
    posicao = padrao.lastIndex;
  }

  return tokens;
}

export function compilarFormula(formula: string): Expressao {
  const tokens = tokenizar(formula);
  let indice = 0;

  const atual = (): Token | undefined => tokens[indice];
  const ehSimbolo = (valor: string): boolean => {
    const token = atual();
    return token?.tipo === "simbolo" && token.valor === valor;
  };
  const consumir = (valor: string): void => {
    if (!ehSimbolo(valor)) {
      throw new FormulaInvalidaError(formula, `esperado "${valor}"`);
    }
    indice += 1;
  };

  // soma := produto (("+" | "-") produto)*
  const soma = (): Expressao => {
    let esquerda = produto();
    while (ehSimbolo("+") || ehSimbolo("-")) {
      const operador = (tokens[indice++] as { valor: "+" | "-" }).valor;
      esquerda = { tipo: "binaria", operador, esquerda, direita: produto() };
    }
    return esquerda;
  };

  // produto := unario (("*" | "/") unario)*
  const produto = (): Expressao => {
    let esquerda = unario();
    while (ehSimbolo("*") || ehSimbolo("/")) {
      const operador = (tokens[indice++] as { valor: "*" | "/" }).valor;
      esquerda = { tipo: "binaria", operador, esquerda, direita: unario() };
    }
    return esquerda;
  };

  const unario = (): Expressao => {
    if (ehSimbolo("-")) {
      indice += 1;
      return { tipo: "negacao", valor: unario() };
    }
    return primario();
  };

  const primario = (): Expressao => {
    const token = atual();
    if (!token) {
      throw new FormulaInvalidaError(formula, "terminou antes do esperado");
    }
    if (token.tipo === "numero") {
      indice += 1;
      return { tipo: "numero", valor: token.valor };
    }
    if (token.tipo === "nome") {
      indice += 1;
      if (!ehSimbolo("(")) {
        return { tipo: "variavel", nome: token.valor };
      }
      if (!ehNomeFuncao(token.valor)) {
        throw new FormulaInvalidaError(formula, `função desconhecida "${token.valor}"`);
      }
      consumir("(");
      const argumentos = [soma()];
      while (ehSimbolo(",")) {
        indice += 1;
        argumentos.push(soma());
      }
      consumir(")");
      const [minimo, maximo] = FUNCOES[token.valor].aridade;
      if (argumentos.length < minimo || argumentos.length > maximo) {
        throw new FormulaInvalidaError(formula, `número de argumentos errado em ${token.valor}()`);
      }
      return { tipo: "funcao", nome: token.valor, argumentos };
    }
    if (token.valor === "(") {
      indice += 1;
      const interna = soma();
      consumir(")");
      return interna;
    }
    throw new FormulaInvalidaError(formula, `"${token.valor}" fora de lugar`);
  };

  if (tokens.length === 0) {
    throw new FormulaInvalidaError(formula, "vazia");
  }
  const expressao = soma();
  if (indice < tokens.length) {
    throw new FormulaInvalidaError(formula, "sobrou texto no final");
  }
  return expressao;
}

export function variaveisDaFormula(expressao: Expressao): Set<string> {
  switch (expressao.tipo) {
    case "numero":
      return new Set();
    case "variavel":
      return new Set([expressao.nome]);
    case "negacao":
      return variaveisDaFormula(expressao.valor);
    case "binaria":
      return new Set([...variaveisDaFormula(expressao.esquerda), ...variaveisDaFormula(expressao.direita)]);
    case "funcao":
      return new Set(expressao.argumentos.flatMap((argumento) => [...variaveisDaFormula(argumento)]));
  }
}

export function avaliarFormula(expressao: Expressao, variaveis: Readonly<Record<string, number | null | undefined>>): number {
  switch (expressao.tipo) {
    case "numero":
      return expressao.valor;
    case "variavel": {
      const valor = Object.hasOwn(variaveis, expressao.nome) ? variaveis[expressao.nome] : undefined;
      if (valor === null || valor === undefined || !Number.isFinite(valor)) {
        throw new VariavelAusenteError(expressao.nome);
      }
      return valor;
    }
    case "negacao":
      return -avaliarFormula(expressao.valor, variaveis);
    case "binaria":
      return aplicarOperador(
        expressao.operador,
        avaliarFormula(expressao.esquerda, variaveis),
        avaliarFormula(expressao.direita, variaveis),
      );
    case "funcao":
      return FUNCOES[expressao.nome].aplicar(
        expressao.argumentos.map((argumento) => avaliarFormula(argumento, variaveis)),
      );
  }
}

function aplicarOperador(operador: "+" | "-" | "*" | "/", esquerda: number, direita: number): number {
  switch (operador) {
    case "+":
      return esquerda + direita;
    case "-":
      return esquerda - direita;
    case "*":
      return esquerda * direita;
    case "/":
      if (direita === 0) {
        throw new DivisaoPorZeroError();
      }
      return esquerda / direita;
  }
}
