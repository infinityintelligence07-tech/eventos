import { conferirEnvio, type ConferenciaDoEnvio, type MotivoDaPendencia, motivoDaPendencia } from "./status-escala";
import { calcularVagas, type DadosDoEvento, RegraVagasInvalidaError, type ResultadoVagas } from "./vagas";

// O que a Montar escala (e o Resumo do evento) mostram sobre as vagas: "sugerido N" pela regra,
// número confirmado, funções digitadas ainda sem número e o que impede o envio para aprovação.

export type LinhaDaMontagem = {
  id: string;
  /** Código da função (nulo em linhas antigas do GH, por cargo). */
  funcao: string | null;
  nomeDaFuncao: string;
  data: string;
  quantidade: number;
  origem: "REGRA" | "MANUAL";
  confirmada: boolean;
  ativas: number;
};

export type LinhaResumida = LinhaDaMontagem & {
  /** Pela regra do tipo, calculado agora. Nulo em linha manual, função digitada ou sem dado. */
  sugerido: number | null;
  digitada: boolean;
};

export type ResumoDaMontagem = {
  linhas: LinhaResumida[];
  /** Funções da regra sem linha ainda: digitadas (Staff do Confronto) ou esperando dado (fila, público). */
  pendencias: { funcao: string; nomeDaFuncao: string; motivo: MotivoDaPendencia }[];
  /** Linhas confirmadas cujo número ficou diferente da sugestão (o público ou a fila mudou). */
  sugestoesMudadas: { nomeDaFuncao: string; sugerido: number; confirmado: number }[];
  vagas: number;
  preenchidas: number;
  vagasAbertas: number;
  envio: ConferenciaDoEnvio;
  semRegra: boolean;
  regraInvalida: string[] | null;
};

function calcular(regra: unknown, dados: DadosDoEvento): { resultado: ResultadoVagas; erros: string[] | null } {
  try {
    return { resultado: calcularVagas(regra, dados), erros: null };
  } catch (cause: unknown) {
    if (cause instanceof RegraVagasInvalidaError) return { resultado: { vagas: [], pendencias: [] }, erros: cause.erros };
    throw cause;
  }
}

export function resumoDaMontagem(
  regra: unknown,
  dados: DadosDoEvento,
  linhas: readonly LinhaDaMontagem[],
  nomeDaFuncao: (codigo: string) => string,
): ResumoDaMontagem {
  const { resultado, erros } = calcular(regra, dados);
  const sugeridas = new Map(resultado.vagas.map((vaga) => [vaga.funcao, vaga.quantidade]));
  const digitadas = new Set(resultado.pendencias.filter((pendencia) => "digitar" in pendencia).map((pendencia) => pendencia.funcao));
  const comLinha = new Set(linhas.map((linha) => linha.funcao));

  const resumidas = linhas.map((linha): LinhaResumida => {
    const daRegra = linha.origem === "REGRA" && linha.funcao !== null;
    return {
      ...linha,
      sugerido: daRegra ? (sugeridas.get(linha.funcao!) ?? null) : null,
      digitada: daRegra && digitadas.has(linha.funcao!),
    };
  });

  const pendencias = resultado.pendencias
    .filter((pendencia) => !comLinha.has(pendencia.funcao))
    .map((pendencia) => ({ funcao: pendencia.funcao, nomeDaFuncao: nomeDaFuncao(pendencia.funcao), motivo: motivoDaPendencia(pendencia) }));

  const sugestoesMudadas = resumidas.flatMap((linha) =>
    linha.confirmada && linha.sugerido !== null && linha.sugerido !== linha.quantidade
      ? [{ nomeDaFuncao: linha.nomeDaFuncao, sugerido: linha.sugerido, confirmado: linha.quantidade }]
      : [],
  );

  const vagas = linhas.reduce((soma, linha) => soma + linha.quantidade, 0);
  const preenchidas = linhas.reduce((soma, linha) => soma + Math.min(linha.ativas, linha.quantidade), 0);

  return {
    linhas: resumidas,
    pendencias,
    sugestoesMudadas,
    vagas,
    preenchidas,
    vagasAbertas: vagas - preenchidas,
    envio: conferirEnvio(
      linhas.map((linha) => ({ ...linha, funcao: linha.funcao ?? linha.id })),
      pendencias,
    ),
    semRegra: erros === null && resultado.vagas.length === 0 && resultado.pendencias.length === 0,
    regraInvalida: erros,
  };
}
