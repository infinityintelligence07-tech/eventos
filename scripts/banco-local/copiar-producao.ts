import { Client, type ClientBase, types } from "pg";

// Copia da produção os cadastros e o calendário. A origem é aberta só para leitura:
// transação READ ONLY conferida antes da primeira consulta e apenas SELECT/SHOW passam.

export type Tabela = { schema: string; nome: string };

/** Ordem de inserção (respeita as FKs). As quatro de cadastro substituem o que as migrations semearam. */
export const TABELAS_COPIADAS: Tabela[] = [
  { schema: "core", nome: "polo" },
  { schema: "eventos", nome: "tipo_evento" },
  { schema: "eventos", nome: "funcao" },
  { schema: "eventos", nome: "local" },
  { schema: "eventos", nome: "evento" },
  { schema: "eventos", nome: "escala" },
  { schema: "eventos", nome: "regra_custo" },
  { schema: "eventos", nome: "modelo_copy" },
];

const SINCRONIZADAS = ["tipo_evento", "funcao", "regra_custo", "modelo_copy"];

export type Copia = { tabela: Tabela; colunas: string[]; linhas: Record<string, unknown>[] }[];

// Valores chegam como texto (datas, numeric, bigint sem conversão de fuso ou precisão) e voltam
// pelo json_populate_recordset, que usa a entrada do próprio tipo. json/jsonb e boolean vêm parseados.
const PARSEADOS = new Set<number>([types.builtins.JSON, types.builtins.JSONB, types.builtins.BOOL]);
const tiposTextuais = {
  getTypeParser: ((oid: number, formato?: "text" | "binary") =>
    PARSEADOS.has(oid) ? types.getTypeParser(oid, formato ?? "text") : (valor: string) => valor) as typeof types.getTypeParser,
};

function nomeQualificado(t: Tabela): string {
  return `"${t.schema}"."${t.nome}"`;
}

/** Remove a URL (e a senha) de qualquer mensagem que for parar no terminal. */
export function semSegredo(mensagem: string, url: string): string {
  let limpo = mensagem.split(url).join("<DATABASE_URL>");
  try {
    const senha = decodeURIComponent(new URL(url).password);
    if (senha) limpo = limpo.split(senha).join("***");
  } catch {
    // URL inválida: não há senha para esconder.
  }
  return limpo;
}

async function colunasDe(cliente: ClientBase, t: Tabela): Promise<string[]> {
  const r = await cliente.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    [t.schema, t.nome],
  );
  return r.rows.map((linha) => linha.column_name);
}

export async function lerProducao(urlOrigem: string, colunasLocais: Map<string, string[]>): Promise<Copia> {
  const destino = new URL(urlOrigem);
  if (["localhost", "127.0.0.1", "::1"].includes(destino.hostname) && destino.port === "55432") {
    throw new Error("A origem aponta para o próprio banco local. Use a DATABASE_URL da produção (ou ORIGEM_DATABASE_URL).");
  }

  const origem = new Client({ connectionString: urlOrigem, application_name: "eventos-banco-local (leitura)", types: tiposTextuais });
  const ler = async (texto: string, params: unknown[] = []) => {
    if (!/^\s*(SELECT|SHOW)\b/i.test(texto)) throw new Error("Só SELECT/SHOW na origem.");
    return origem.query(texto, params);
  };

  await origem.connect();
  try {
    await origem.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const somenteLeitura = (await ler("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (somenteLeitura !== "on") throw new Error("A conexão de origem não ficou somente leitura. Abortado.");

    const copia: Copia = [];
    for (const tabela of TABELAS_COPIADAS) {
      const naOrigem = new Set(await colunasDe(origem, tabela));
      const locais = colunasLocais.get(nomeQualificado(tabela)) ?? [];
      const colunas = locais.filter((c) => naOrigem.has(c));
      const faltando = locais.filter((c) => !naOrigem.has(c));
      if (faltando.length > 0) {
        console.log(`  ${nomeQualificado(tabela)}: ${faltando.join(", ")} ainda não existe(m) na produção; fica(m) com o padrão local.`);
      }
      const lista = colunas.map((c) => `"${c}"`).join(", ");
      const r = await ler(`SELECT ${lista} FROM ${nomeQualificado(tabela)} ORDER BY "id"`);
      copia.push({ tabela, colunas, linhas: r.rows });
    }
    return copia;
  } finally {
    await origem.query("ROLLBACK").catch(() => undefined);
    await origem.end();
  }
}

export async function colunasLocais(local: ClientBase): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  for (const tabela of TABELAS_COPIADAS) mapa.set(nomeQualificado(tabela), await colunasDe(local, tabela));
  return mapa;
}

// Assinatura de conteúdo (sem id e datas) para dizer o que a produção tem de diferente da semente das migrations.
const CHAVES_DE_CONTEUDO: Record<string, string[]> = {
  tipo_evento: ["sigla", "nome", "dias", "regra_vagas", "ativo"],
  funcao: ["codigo", "nome", "ativo"],
  regra_custo: ["categoria", "codigo", "nome", "uf", "unidade", "valor_centavos", "parametros", "vigente_desde", "ativo", "observacao"],
  modelo_copy: ["tipo", "nome", "corpo", "ativo"],
};

function assinatura(linha: Record<string, unknown>, chaves: string[]): string {
  return JSON.stringify(chaves.map((c) => linha[c] ?? null));
}

export type Divergencia = { tabela: string; semente: number; producao: number; diferentes: number };

/** Grava a cópia no banco local (dentro da transação do chamador). */
export async function gravarCopia(local: ClientBase, copia: Copia): Promise<Divergencia[]> {
  const divergencias: Divergencia[] = [];
  const porNome = new Map(copia.map((item) => [item.tabela.nome, item]));

  for (const nome of SINCRONIZADAS) {
    const chaves = CHAVES_DE_CONTEUDO[nome] ?? [];
    const semente = await local.query<Record<string, unknown>>(
      `SELECT to_jsonb(t) AS j FROM eventos."${nome}" t`,
    );
    const assinaturas = new Set(semente.rows.map((r) => assinatura(r.j as Record<string, unknown>, chaves)));
    const daProducao = porNome.get(nome)?.linhas ?? [];
    const diferentes = daProducao.filter((linha) => !assinaturas.has(assinatura(normalizar(linha), chaves))).length;
    divergencias.push({ tabela: `eventos.${nome}`, semente: semente.rowCount ?? 0, producao: daProducao.length, diferentes });
  }

  // regra_custo depende de tipo_evento; modelo_copy e funcao ainda não têm dependentes no banco recém-criado.
  await local.query('DELETE FROM eventos."regra_custo"; DELETE FROM eventos."modelo_copy"; DELETE FROM eventos."tipo_evento"; DELETE FROM eventos."funcao";');

  for (const { tabela, colunas, linhas } of copia) {
    if (linhas.length === 0) continue;
    const lista = colunas.map((c) => `"${c}"`).join(", ");
    await local.query(
      `INSERT INTO ${nomeQualificado(tabela)} (${lista}) SELECT ${lista} FROM json_populate_recordset(NULL::${nomeQualificado(tabela)}, $1::json)`,
      [JSON.stringify(linhas)],
    );
  }
  return divergencias;
}

// Na origem, datas e números vêm como texto; to_jsonb do lado local devolve número. Aproxima os dois.
function normalizar(linha: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    saida[chave] = typeof valor === "string" && /^-?\d+$/.test(valor) && chave !== "codigo" && chave !== "sigla" ? Number(valor) : valor;
  }
  return saida;
}
