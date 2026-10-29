import { z } from "zod";

import type { FalhaDaAcao } from "../_componentes/ui/resultado-acao";

export type { FalhaDaAcao, ResultadoAcao } from "../_componentes/ui/resultado-acao";

export const MENSAGEM_FORMULARIO_INVALIDO = "Confira os campos destacados.";

const CHAVE_PROIBIDA = new Set(["__proto__", "prototype", "constructor"]);

// Limites contra formulário forjado: `linhas[2000000].x=1` (60 bytes) criaria um array de 2 milhões de posições.
export const LIMITES_DO_FORMULARIO = { campos: 1000, indice: 200, profundidade: 6, tamanhoDaChave: 200 } as const;
export const MENSAGEM_FORMULARIO_GRANDE = "O formulário veio com campos demais. Recarregue a página e tente de novo.";

export class FormularioGrandeDemaisError extends Error {
  constructor(motivo: string) {
    super(`formulário recusado: ${motivo}`);
    this.name = "FormularioGrandeDemaisError";
  }
}

type Arvore = Record<string, unknown> | unknown[];

function partesDaChave(chave: string): string[] | null {
  if (chave.length > LIMITES_DO_FORMULARIO.tamanhoDaChave) throw new FormularioGrandeDemaisError("chave longa demais");
  const partes = chave.replace(/\]/g, "").split(/\[|\./);
  if (partes.length > LIMITES_DO_FORMULARIO.profundidade) throw new FormularioGrandeDemaisError("chave funda demais");
  return partes.some((parte) => CHAVE_PROIBIDA.has(parte)) ? null : partes;
}

function indiceDaLista(lista: unknown[], parte: string): number | null {
  if (parte !== "" && !/^\d+$/.test(parte)) return null;
  if (parte.length > 4) throw new FormularioGrandeDemaisError("índice grande demais");
  const indice = parte === "" ? lista.length : Number(parte);
  if (indice > LIMITES_DO_FORMULARIO.indice) throw new FormularioGrandeDemaisError("índice grande demais");
  return indice;
}

function atribuir(raiz: Record<string, unknown>, partes: string[], valor: unknown): void {
  let atual: Arvore = raiz;
  for (const [posicao, parte] of partes.entries()) {
    const ultima = posicao === partes.length - 1;
    const proxima = partes[posicao + 1];
    let chave: string | number = parte;
    if (Array.isArray(atual)) {
      const indice = indiceDaLista(atual, parte);
      if (indice === null) return;
      chave = indice;
    }
    const destino = atual as Record<string | number, unknown>;

    if (ultima) {
      const existente = destino[chave];
      if (existente === undefined) destino[chave] = valor;
      else if (Array.isArray(existente)) existente.push(valor);
      else destino[chave] = [existente, valor];
      return;
    }
    if (typeof destino[chave] !== "object" || destino[chave] === null) {
      destino[chave] = proxima === "" || /^\d+$/.test(proxima ?? "") ? [] : {};
    }
    atual = destino[chave] as Arvore;
  }
}

/**
 * FormData → objeto para o Zod. Aceita `nome`, `lista[]`, `linhas[0].quantidade` e `linhas.0.quantidade`;
 * chave repetida vira lista; texto vazio e arquivo vazio viram ausentes. Ignora os campos internos do Next.
 * Lança FormularioGrandeDemaisError acima de LIMITES_DO_FORMULARIO.
 */
export function dadosDoFormulario(form: FormData): Record<string, unknown> {
  const dados: Record<string, unknown> = {};
  let campos = 0;
  for (const [chave, valor] of form.entries()) {
    if (chave.startsWith("$ACTION")) continue;
    if (++campos > LIMITES_DO_FORMULARIO.campos) throw new FormularioGrandeDemaisError("campos demais");
    if (valor === "" || (typeof valor !== "string" && valor.size === 0 && valor.name === "")) continue;
    const partes = partesDaChave(chave);
    if (partes) atribuir(dados, partes, valor);
  }
  return dados;
}

const mensagensEmPortugues = z.locales.pt().localeError;

const MENSAGENS: z.core.$ZodErrorMap = (issue) => {
  if (issue.code === "invalid_type" && issue.input === undefined) return "Preencha este campo.";
  return mensagensEmPortugues(issue);
};

/** Erros do Zod por campo (`linhas.0.quantidade`); erros sem campo vão para `erro`. */
export function falhaDaValidacao(erro: z.ZodError): FalhaDaAcao {
  const campos: Record<string, string[]> = {};
  const gerais: string[] = [];
  for (const issue of erro.issues) {
    if (issue.path.length === 0) {
      gerais.push(issue.message);
      continue;
    }
    const caminho = issue.path.map(String).join(".");
    (campos[caminho] ??= []).push(issue.message);
  }
  return { ok: false, erro: gerais[0] ?? MENSAGEM_FORMULARIO_INVALIDO, campos };
}

/** Valida o formulário com o schema do domínio. Mensagens em português (o schema pode trazer as próprias). */
export function lerFormulario<S extends z.ZodType>(
  form: FormData,
  schema: S,
): { ok: true; dados: z.output<S> } | FalhaDaAcao {
  let dados: Record<string, unknown>;
  try {
    dados = dadosDoFormulario(form);
  } catch (erro: unknown) {
    if (erro instanceof FormularioGrandeDemaisError) return { ok: false, erro: MENSAGEM_FORMULARIO_GRANDE };
    throw erro;
  }
  const resultado = schema.safeParse(dados, { error: MENSAGENS });
  return resultado.success ? { ok: true, dados: resultado.data } : falhaDaValidacao(resultado.error);
}
