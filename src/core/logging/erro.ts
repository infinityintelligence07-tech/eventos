// Erro → objeto de log com lista fixa de campos. Erros do Drizzle e do pg carregam os valores da query
// (`params`, `detail` com "Key (email)=(…)", `where`, `query`); nada disso pode ir para o log (dados pessoais).

const CAMPOS_DO_POSTGRES = ["code", "constraint", "table", "column", "schema", "routine", "severity"] as const;

const LIMITE_DA_MENSAGEM = 300;
const LIMITE_DE_LINHAS_DA_PILHA = 8;
const LIMITE_DE_CAUSAS = 3;

export type ErroParaLog = {
  name: string;
  message: string;
  stack?: string;
  cause?: ErroParaLog;
} & Partial<Record<(typeof CAMPOS_DO_POSTGRES)[number], string>>;

function textoDoCampo(erro: object, campo: string): string | undefined {
  const valor = (erro as Record<string, unknown>)[campo];
  return typeof valor === "string" && valor.length <= 200 ? valor : undefined;
}

/**
 * Primeira linha da mensagem, sem o "params: …" do Drizzle. Em erro do Postgres, texto entre aspas vira "…" (o pg põe
 * ali o valor recusado, ex.: invalid input syntax for type uuid: "…"), salvo quando é o nome da constraint/tabela/coluna.
 */
function mensagemSegura(erro: Error, nomesConhecidos: Set<string>, doPostgres: boolean): string {
  const primeiraLinha = (erro.message ?? "").split("\n")[0]!.replace(/\s*params:.*$/i, "");
  // No "Failed query" do Drizzle as aspas são identificadores SQL (os valores vão em $1, $2…).
  const semValores = doPostgres
    ? primeiraLinha.replace(/"([^"]*)"/g, (trecho, conteudo: string) => (nomesConhecidos.has(conteudo) ? trecho : '"…"'))
    : primeiraLinha;
  return semValores.length > LIMITE_DA_MENSAGEM ? `${semValores.slice(0, LIMITE_DA_MENSAGEM)}…` : semValores;
}

/** Só as linhas "at …": a primeira linha do stack repete a mensagem inteira, com os params. */
function pilhaSegura(erro: Error): string | undefined {
  const linhas = (erro.stack ?? "").split("\n").filter((linha) => linha.trimStart().startsWith("at "));
  return linhas.length > 0 ? linhas.slice(0, LIMITE_DE_LINHAS_DA_PILHA).join("\n") : undefined;
}

export function serializarErro(erro: unknown, profundidade = 0): ErroParaLog {
  if (!(erro instanceof Error)) return { name: typeof erro, message: "valor lançado não é um Error" };

  const saida: ErroParaLog = { name: erro.name, message: "" };
  const nomesConhecidos = new Set<string>();
  for (const campo of CAMPOS_DO_POSTGRES) {
    const valor = textoDoCampo(erro, campo);
    if (valor === undefined) continue;
    saida[campo] = valor;
    nomesConhecidos.add(valor);
  }
  saida.message = mensagemSegura(erro, nomesConhecidos, saida.code !== undefined);
  const pilha = pilhaSegura(erro);
  if (pilha) saida.stack = pilha;
  if (erro.cause !== undefined && profundidade < LIMITE_DE_CAUSAS) saida.cause = serializarErro(erro.cause, profundidade + 1);
  return saida;
}
