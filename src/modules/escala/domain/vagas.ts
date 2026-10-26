import { z } from "zod";

import {
  avaliarFormula,
  compilarFormula,
  type Expressao,
  FormulaInvalidaError,
  VariavelAusenteError,
  variaveisDaFormula,
} from "./formula";

// Gera as vagas da escala a partir de `tipo_evento.regra_vagas`.
// Ex.: Confronto com 300 alunos e 90 na fila -> LIDER 12, PAI_MAE 6, DJ 1...
// Uma fórmula pode usar a quantidade de uma função anterior ("2 * STAFF_LIDER").

/** Dados do evento que as fórmulas podem usar. */
export const VARIAVEIS_DO_EVENTO = ["expectativa_publico", "pessoas_na_fila"] as const;
export type VariavelDoEvento = (typeof VARIAVEIS_DO_EVENTO)[number];
export type DadosDoEvento = Partial<Record<VariavelDoEvento, number | null>>;

const codigoFuncao = z.string().regex(/^[A-Z0-9_]{2,30}$/, "código de função em MAIÚSCULAS");

const regraFuncaoSchema = z.union([
  z.object({ funcao: codigoFuncao, fixo: z.number().int().min(0) }).strict(),
  z.object({ funcao: codigoFuncao, formula: z.string().min(1) }).strict(),
]);

const regraVagasSchema = z
  .object({ funcoes: z.array(regraFuncaoSchema).default([]) })
  .strict();

export type RegraVagas = z.infer<typeof regraVagasSchema>;

type FuncaoCompilada = { funcao: string; fixo: number } | { funcao: string; expressao: Expressao };

export type Vaga = { funcao: string; quantidade: number };
export type Pendencia = { funcao: string; variavel: string };
export type ResultadoVagas = { vagas: Vaga[]; pendencias: Pendencia[] };

export class RegraVagasInvalidaError extends Error {
  constructor(readonly erros: string[]) {
    super(`Regra de vagas inválida: ${erros.join("; ")}`);
    this.name = "RegraVagasInvalidaError";
  }
}

/** Valida e compila a regra. Os erros servem para a tela de configurações. */
export function compilarRegraVagas(json: unknown): FuncaoCompilada[] {
  const leitura = regraVagasSchema.safeParse(json ?? {});
  if (!leitura.success) {
    throw new RegraVagasInvalidaError(
      leitura.error.issues.map((issue) => `${issue.path.join(".") || "regra"}: ${issue.message}`),
    );
  }

  const erros: string[] = [];
  const conhecidas = new Set<string>(VARIAVEIS_DO_EVENTO);
  const compiladas: FuncaoCompilada[] = [];

  for (const regra of leitura.data.funcoes) {
    if (conhecidas.has(regra.funcao)) {
      erros.push(`${regra.funcao}: função repetida ou com nome de variável do evento`);
      continue;
    }

    if ("fixo" in regra) {
      compiladas.push({ funcao: regra.funcao, fixo: regra.fixo });
    } else {
      try {
        const expressao = compilarFormula(regra.formula);
        const desconhecidas = [...variaveisDaFormula(expressao)].filter((nome) => !conhecidas.has(nome));
        if (desconhecidas.length > 0) {
          erros.push(
            `${regra.funcao}: usa ${desconhecidas.join(", ")}, que não é dado do evento nem função anterior`,
          );
        }
        compiladas.push({ funcao: regra.funcao, expressao });
      } catch (cause: unknown) {
        if (!(cause instanceof FormulaInvalidaError)) {
          throw cause;
        }
        erros.push(`${regra.funcao}: ${cause.message}`);
      }
    }
    conhecidas.add(regra.funcao);
  }

  if (erros.length > 0) {
    throw new RegraVagasInvalidaError(erros);
  }
  return compiladas;
}

/**
 * Calcula as vagas. Se faltar um dado do evento (ex.: pessoas na fila ainda não informadas),
 * a função entra em `pendencias` e quem depende dela também, em vez de gerar 0 vagas.
 */
export function calcularVagas(regra: unknown, dados: DadosDoEvento): ResultadoVagas {
  const vagas: Vaga[] = [];
  const pendencias: Pendencia[] = [];
  const valores: Record<string, number | null | undefined> = { ...dados };

  for (const funcao of compilarRegraVagas(regra)) {
    if ("fixo" in funcao) {
      valores[funcao.funcao] = funcao.fixo;
      vagas.push({ funcao: funcao.funcao, quantidade: funcao.fixo });
      continue;
    }

    try {
      const bruto = avaliarFormula(funcao.expressao, valores);
      // Vaga é inteira e não negativa; fração sobe (meia pessoa é uma pessoa).
      const quantidade = Math.max(0, Math.ceil(Math.round(bruto * 1e9) / 1e9));
      valores[funcao.funcao] = quantidade;
      vagas.push({ funcao: funcao.funcao, quantidade });
    } catch (cause: unknown) {
      if (!(cause instanceof VariavelAusenteError)) {
        throw cause;
      }
      valores[funcao.funcao] = undefined;
      const origem = pendencias.find((pendencia) => pendencia.funcao === cause.variavel);
      pendencias.push({ funcao: funcao.funcao, variavel: origem?.variavel ?? cause.variavel });
    }
  }

  return { vagas, pendencias };
}

export function totalDeVagas(resultado: ResultadoVagas): number {
  return resultado.vagas.reduce((soma, vaga) => soma + vaga.quantidade, 0);
}
