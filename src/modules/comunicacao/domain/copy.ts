import { createHash } from "node:crypto";

// Motor de copy: preenche os modelos de `eventos.modelo_copy` com os dados de cada pessoa.
//   {{evento.cidade}}            valor do caminho nos dados
//   {{genero:ESCALADO|ESCALADA}} escolhe pela pessoa.sexo (M|F); um 3º termo é usado sem sexo
// O que não tiver valor fica visível no texto e volta em `faltando`, para não sair copy com buraco.

export type ValorCopy = string | number | null | undefined;
export type DadosCopy = { [chave: string]: ValorCopy | DadosCopy };

export type CopyGerada = {
  texto: string;
  faltando: string[];
  pronta: boolean;
  /** Hash só dos dados que o modelo usa: muda quando a copy enviada fica desatualizada. */
  dadosHash: string;
};

/** Variáveis disponíveis para quem edita os modelos. */
export const VARIAVEIS_COPY = {
  saudacao: "Bom dia / Boa tarde / Boa noite, pela hora da geração",
  link_custos: "Link da solicitação de custo da pessoa neste evento",
  "evento.tipo": "Nome do tipo de evento (Confronto, ASM...)",
  "evento.codigo": "Código do evento (ASM_POA_234)",
  "evento.cidade": "Cidade do evento",
  "evento.data": "Período do evento (12 a 14 de dezembro)",
  "evento.horario": "Horário de chegada da equipe",
  "local.nome": "Nome do local do evento",
  "pessoa.nome": "Nome completo",
  "pessoa.primeiro_nome": "Primeiro nome",
  "pessoa.funcao": "Função na escala",
  "pessoa.deslocamento": "Como a pessoa vai (carro próprio, carona, ônibus, voo)",
  "pessoa.sexo": "M ou F (usado por {{genero:...}})",
  "hospedagem.hotel": "Hotel",
  "hospedagem.endereco": "Endereço do hotel",
  "hospedagem.colega": "Colega de quarto",
} as const;

const MARCADOR = /\{\{\s*([^{}]+?)\s*\}\}/g;
const CAMINHO = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*$/;

type Marcador =
  | { tipo: "variavel"; caminho: string }
  | { tipo: "genero"; masculino: string; feminino: string; semSexo?: string };

function lerMarcador(conteudo: string): Marcador | null {
  if (conteudo.startsWith("genero:")) {
    const opcoes = conteudo.slice("genero:".length).split("|");
    if (opcoes.length < 2 || opcoes.length > 3) {
      return null;
    }
    const [masculino, feminino, semSexo] = opcoes as [string, string, string?];
    return { tipo: "genero", masculino, feminino, semSexo };
  }
  return CAMINHO.test(conteudo) ? { tipo: "variavel", caminho: conteudo } : null;
}

function buscar(dados: DadosCopy, caminho: string): ValorCopy {
  let atual: ValorCopy | DadosCopy = dados;
  for (const parte of caminho.split(".")) {
    if (atual === null || typeof atual !== "object" || !Object.hasOwn(atual, parte)) {
      return undefined;
    }
    atual = atual[parte];
  }
  return typeof atual === "object" && atual !== null ? undefined : atual;
}

function temValor(valor: ValorCopy): valor is string | number {
  return typeof valor === "number" ? Number.isFinite(valor) : typeof valor === "string" && valor.trim() !== "";
}

/** Erros de sintaxe e variáveis fora do catálogo, para a tela de edição de modelos. */
export function validarModelo(corpo: string): string[] {
  const erros: string[] = [];
  for (const [, conteudo] of corpo.matchAll(MARCADOR)) {
    const marcador = lerMarcador(conteudo!);
    if (!marcador) {
      erros.push(`{{${conteudo}}} não é uma variável válida`);
    } else if (marcador.tipo === "variavel" && !Object.hasOwn(VARIAVEIS_COPY, marcador.caminho)) {
      erros.push(`{{${marcador.caminho}}} não existe`);
    }
  }
  const abertos = corpo.split("{{").length - 1;
  const fechados = corpo.split("}}").length - 1;
  if (abertos !== fechados) {
    erros.push("há {{ ou }} sem par");
  }
  return erros;
}

export function gerarCopy(corpo: string, dados: DadosCopy): CopyGerada {
  const faltando = new Set<string>();
  const usados: Record<string, ValorCopy> = {};

  const texto = corpo.replace(MARCADOR, (original, conteudo: string) => {
    const marcador = lerMarcador(conteudo);
    if (!marcador) {
      return original;
    }

    if (marcador.tipo === "genero") {
      const sexo = buscar(dados, "pessoa.sexo");
      usados["pessoa.sexo"] = sexo ?? null;
      if (sexo === "M") return marcador.masculino;
      if (sexo === "F") return marcador.feminino;
      if (marcador.semSexo !== undefined) return marcador.semSexo;
      faltando.add("pessoa.sexo");
      return original;
    }

    const valor = buscar(dados, marcador.caminho);
    usados[marcador.caminho] = valor ?? null;
    if (!temValor(valor)) {
      faltando.add(marcador.caminho);
      return original;
    }
    return String(valor).trim();
  });

  const lista = [...faltando].sort();
  return { texto, faltando: lista, pronta: lista.length === 0, dadosHash: hashDosDados(usados) };
}

function hashDosDados(usados: Record<string, ValorCopy>): string {
  const ordenado = Object.keys(usados)
    .sort()
    .map((chave) => [chave, usados[chave] ?? null]);
  return createHash("sha256").update(JSON.stringify(ordenado)).digest("hex");
}

// ---------------------------------------------------------------------------
// Formatação dos valores que entram na copy
// ---------------------------------------------------------------------------

const FUSO = "America/Sao_Paulo";
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, depois "Boa noite" (horário de Brasília). */
export function saudacao(instante: Date): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(instante),
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function lerData(iso: string): { ano: number; mes: number; dia: number } {
  const encontrado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!encontrado) {
    throw new Error(`Data fora do formato AAAA-MM-DD: ${iso}`);
  }
  return { ano: Number(encontrado[1]), mes: Number(encontrado[2]), dia: Number(encontrado[3]) };
}

/**
 * Período em português a partir de datas AAAA-MM-DD (sem fuso, como vem do banco):
 * "12 de dezembro", "12 a 14 de dezembro", "30 de novembro a 2 de dezembro",
 * "30 de dezembro de 2026 a 2 de janeiro de 2027".
 */
export function formatarPeriodo(inicio: string, fim?: string | null): string {
  const a = lerData(inicio);
  const b = fim ? lerData(fim) : a;
  const mes = (data: { mes: number }) => MESES[data.mes - 1];

  if (a.ano === b.ano && a.mes === b.mes && a.dia === b.dia) {
    return `${a.dia} de ${mes(a)}`;
  }
  if (a.ano === b.ano && a.mes === b.mes) {
    return `${a.dia} a ${b.dia} de ${mes(a)}`;
  }
  if (a.ano === b.ano) {
    return `${a.dia} de ${mes(a)} a ${b.dia} de ${mes(b)}`;
  }
  return `${a.dia} de ${mes(a)} de ${a.ano} a ${b.dia} de ${mes(b)} de ${b.ano}`;
}

/** "MARIA DA SILVA" -> "Maria"; "joão pedro" -> "João". */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}
