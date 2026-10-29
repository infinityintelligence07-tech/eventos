import { createHash } from "node:crypto";

// Motor de copy: preenche os modelos de `eventos.modelo_copy` com os dados de cada pessoa.
//   {{evento.cidade}}            valor do caminho nos dados
//   {{genero:ESCALADO|ESCALADA}} escolhe pela pessoa.sexo (M|F); um 3º termo é usado sem sexo
// O que não tiver valor fica visível no texto e volta em `faltando`, para não sair copy com buraco.

export type ValorCopy = string | number | null | undefined;
export type DadosCopy = { [chave: string]: ValorCopy | DadosCopy };

/** Trecho do texto pronto ou o lugar de um dado que falta (a tela destaca como `[falta: voo de ida]`). */
export type ParteDaCopy = { tipo: "texto"; texto: string } | { tipo: "falta"; variavel: string; original: string };

export type CopyGerada = {
  texto: string;
  partes: ParteDaCopy[];
  faltando: string[];
  pronta: boolean;
  /** Hash só dos dados que o modelo usa: muda quando a copy enviada fica desatualizada. */
  dadosHash: string;
};

/** Onde o time preenche o dado que falta (para o alerta "Preencher em …"). */
export type OndePreencher = "AUTOMATICO" | "IAM_CONTROL" | "EVENTO" | "ESCALA" | "PESSOAS" | "LOGISTICA" | "CONFIGURACOES";

type Variavel = { rotulo: string; descricao: string; onde: OndePreencher };

/** Variáveis disponíveis para quem edita os modelos. `rotulo` completa "falta …" e os botões "Inserir campo". */
export const VARIAVEIS_COPY = {
  saudacao: { rotulo: "saudação", descricao: "Bom dia / Boa tarde / Boa noite, pela hora da geração", onde: "AUTOMATICO" },
  link_custos: { rotulo: "link do formulário de custos", descricao: "Link do formulário de custos (Configurações › Modelos de copy)", onde: "CONFIGURACOES" },
  "evento.tipo": { rotulo: "tipo do evento", descricao: "Nome do tipo de evento (Confronto, ASM...)", onde: "IAM_CONTROL" },
  "evento.codigo": { rotulo: "código do evento", descricao: "Código do evento (ASM_POA_234)", onde: "IAM_CONTROL" },
  "evento.cidade": { rotulo: "cidade do evento", descricao: "Cidade do local do evento", onde: "EVENTO" },
  "evento.data": { rotulo: "datas do evento", descricao: "Período do evento (12 a 14 de dezembro)", onde: "IAM_CONTROL" },
  "evento.horario": { rotulo: "horário de chegada", descricao: "Horário de chegada da pessoa (início da vaga na escala)", onde: "ESCALA" },
  "local.nome": { rotulo: "local do evento", descricao: "Nome do local do evento", onde: "EVENTO" },
  "pessoa.nome": { rotulo: "nome", descricao: "Nome completo", onde: "PESSOAS" },
  "pessoa.primeiro_nome": { rotulo: "primeiro nome", descricao: "Primeiro nome", onde: "PESSOAS" },
  "pessoa.funcao": { rotulo: "função", descricao: "Função na escala", onde: "ESCALA" },
  "pessoa.deslocamento": { rotulo: "deslocamento", descricao: "Como a pessoa vai (carro próprio, carona, ônibus, voo)", onde: "ESCALA" },
  "pessoa.sexo": { rotulo: "sexo da pessoa", descricao: "M ou F (usado por {{genero:...}})", onde: "PESSOAS" },
  "hospedagem.hotel": { rotulo: "hotel", descricao: "Hotel ou apartamento onde a pessoa dorme", onde: "LOGISTICA" },
  "hospedagem.endereco": { rotulo: "endereço do hotel", descricao: "Endereço do hotel", onde: "LOGISTICA" },
  "hospedagem.colega": { rotulo: "colega de quarto", descricao: "Colega(s) de quarto", onde: "LOGISTICA" },
  "voo.ida": { rotulo: "voo de ida", descricao: "Voo de ida emitido (número, data e hora, trecho e localizador)", onde: "LOGISTICA" },
  "voo.volta": { rotulo: "voo de volta", descricao: "Voo de volta emitido (número, data e hora, trecho e localizador)", onde: "LOGISTICA" },
} as const satisfies Record<string, Variavel>;

export type VariavelDaCopy = keyof typeof VARIAVEIS_COPY;

function variavelConhecida(caminho: string): caminho is VariavelDaCopy {
  return Object.hasOwn(VARIAVEIS_COPY, caminho);
}

/** "voo de ida"; variável fora do catálogo volta como está. */
export function rotuloDaVariavel(caminho: string): string {
  return variavelConhecida(caminho) ? VARIAVEIS_COPY[caminho].rotulo : caminho;
}

/** Onde preencher; variável fora do catálogo só se corrige no modelo. */
export function ondePreencher(caminho: string): OndePreencher | null {
  return variavelConhecida(caminho) ? VARIAVEIS_COPY[caminho].onde : null;
}

/** Variáveis que mudam sem o dado mudar (a saudação depende da hora): ficam fora do hash. */
const FORA_DO_HASH = new Set<string>(["saudacao"]);

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
      erros.push(`{{${conteudo}}} não é um campo válido. Use os botões de Inserir campo.`);
    } else if (marcador.tipo === "variavel" && !variavelConhecida(marcador.caminho)) {
      erros.push(`O campo {{${marcador.caminho}}} não existe. Use os botões de Inserir campo.`);
    }
  }
  const abertos = corpo.split("{{").length - 1;
  const fechados = corpo.split("}}").length - 1;
  if (abertos !== fechados) {
    erros.push("Há {{ ou }} sem par.");
  }
  return erros;
}

type Resolvido = { valor: string } | { falta: string };

function resolver(marcador: Marcador, dados: DadosCopy, usados: Record<string, ValorCopy>): Resolvido {
  if (marcador.tipo === "genero") {
    const sexo = buscar(dados, "pessoa.sexo");
    usados["pessoa.sexo"] = sexo ?? null;
    if (sexo === "M") return { valor: marcador.masculino };
    if (sexo === "F") return { valor: marcador.feminino };
    if (marcador.semSexo !== undefined) return { valor: marcador.semSexo };
    return { falta: "pessoa.sexo" };
  }

  const valor = buscar(dados, marcador.caminho);
  usados[marcador.caminho] = valor ?? null;
  return temValor(valor) ? { valor: String(valor).trim() } : { falta: marcador.caminho };
}

export function gerarCopy(corpo: string, dados: DadosCopy): CopyGerada {
  const faltando = new Set<string>();
  const usados: Record<string, ValorCopy> = {};
  const partes: ParteDaCopy[] = [];

  const acrescentarTexto = (texto: string) => {
    if (!texto) return;
    const ultima = partes.at(-1);
    if (ultima?.tipo === "texto") ultima.texto += texto;
    else partes.push({ tipo: "texto", texto });
  };

  let cursor = 0;
  for (const encontrado of corpo.matchAll(MARCADOR)) {
    const original = encontrado[0];
    acrescentarTexto(corpo.slice(cursor, encontrado.index));
    cursor = encontrado.index + original.length;

    const marcador = lerMarcador(encontrado[1] ?? "");
    if (!marcador) {
      acrescentarTexto(original);
      continue;
    }
    const resolvido = resolver(marcador, dados, usados);
    if ("valor" in resolvido) {
      acrescentarTexto(resolvido.valor);
    } else {
      faltando.add(resolvido.falta);
      partes.push({ tipo: "falta", variavel: resolvido.falta, original });
    }
  }
  acrescentarTexto(corpo.slice(cursor));

  const texto = partes.map((parte) => (parte.tipo === "texto" ? parte.texto : parte.original)).join("");
  const lista = [...faltando].sort();
  return { texto, partes, faltando: lista, pronta: lista.length === 0, dadosHash: hashDosDados(usados) };
}

function hashDosDados(usados: Record<string, ValorCopy>): string {
  const ordenado = Object.keys(usados)
    .filter((chave) => !FORA_DO_HASH.has(chave))
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

/** "08:00" -> "8h"; "07:30" -> "7h30". */
export function formatarHorario(hora: string): string {
  const encontrado = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
  if (!encontrado) {
    throw new Error(`Horário fora do formato HH:MM: ${hora}`);
  }
  const minutos = encontrado[2] === "00" ? "" : encontrado[2];
  return `${Number(encontrado[1])}h${minutos}`;
}

/** "12/12 às 08:10" no horário de Brasília. */
export function formatarDataEHora(instante: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")} às ${parte("hour")}:${parte("minute")}`;
}
