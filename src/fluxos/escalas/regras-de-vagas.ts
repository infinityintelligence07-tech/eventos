import { type AtorDaEscrita, bancoParaLeitura, RegraDeNegocioError } from "@/fluxos/_base";
import {
  calcularVagas,
  criarConsultaDaEscala,
  criarRepositorioRegras,
  criarRepositorioVagas,
  descreverLinha,
  gerarVagasDoEvento,
  type LinhaGuiada,
  lerRegraGuiada,
  RegraVagasInvalidaError,
  regraDasLinhas,
  type Vaga,
} from "@/modules/escala";

import { escrever } from "./comum";

// Configurações › Vagas por tipo de evento (docs/07 §6.8, docs/08 §12.2).

export const PUBLICO_DE_EXEMPLO = 180;
export const FILA_DE_EXEMPLO = 90;

export type RegraDoTipo = {
  id: string;
  sigla: string;
  nome: string;
  linhas: (LinhaGuiada & { nomeDaFuncao: string; descricao: string })[];
  /** Regra gravada que o formulário guiado não consegue ler. */
  erros: string[] | null;
  previa: Vaga[];
};

export type RegrasDeVagas = { tipos: RegraDoTipo[]; funcoes: { codigo: string; nome: string }[] };

export async function listarRegrasDeVagas(): Promise<RegrasDeVagas> {
  const db = await bancoParaLeitura();
  const [tipos, funcoes] = await Promise.all([criarRepositorioRegras(db).tiposComRegra(), criarConsultaDaEscala(db).funcoesAtivas()]);
  const nomes = new Map(funcoes.map((funcao) => [funcao.codigo, funcao.nome]));
  const nomeDaFuncao = (codigo: string) => nomes.get(codigo) ?? codigo;

  return {
    funcoes: funcoes.map(({ codigo, nome }) => ({ codigo, nome })),
    tipos: tipos.map((tipo): RegraDoTipo => {
      try {
        const linhas = lerRegraGuiada(tipo.regraVagas);
        return {
          id: tipo.id,
          sigla: tipo.sigla,
          nome: tipo.nome,
          linhas: linhas.map((linha) => ({ ...linha, nomeDaFuncao: nomeDaFuncao(linha.funcao), descricao: descreverLinha(linha, nomeDaFuncao) })),
          erros: null,
          previa: calcularVagas(tipo.regraVagas, { expectativa_publico: PUBLICO_DE_EXEMPLO, pessoas_na_fila: FILA_DE_EXEMPLO }).vagas,
        };
      } catch (cause: unknown) {
        if (!(cause instanceof RegraVagasInvalidaError)) throw cause;
        return { id: tipo.id, sigla: tipo.sigla, nome: tipo.nome, linhas: [], erros: cause.erros, previa: [] };
      }
    }),
  };
}

/**
 * Grava a regra guiada. Cálculo personalizado só pode ser mantido como estava (a tela não deixa digitar fórmula).
 * Não recalcula eventos: isso é o "Recalcular vagas", separado, para quem edita ver a prévia antes.
 */
export async function salvarRegraDeVagas(
  { tipoEventoId, funcoes }: { tipoEventoId: string; funcoes: LinhaGuiada[] },
  { ator, agora }: { ator: AtorDaEscrita; agora: Date },
): Promise<{ nome: string }> {
  return escrever(ator, async (tx) => {
    const repositorio = criarRepositorioRegras(tx);
    const tipo = await repositorio.travarTipo(tipoEventoId);
    if (!tipo) throw new RegraDeNegocioError("Tipo de evento não encontrado.");

    const atuais = lerRegraGuiada(tipo.regraVagas);
    for (const linha of funcoes) {
      if (linha.modo !== "PERSONALIZADA") continue;
      const atual = atuais.find((item) => item.funcao === linha.funcao);
      if (!atual || atual.modo !== "PERSONALIZADA" || atual.formula !== linha.formula) {
        throw new RegraDeNegocioError(`Escolha como calcular ${linha.funcao}: o cálculo personalizado só pode ser mantido como estava.`);
      }
    }
    const cadastradas = new Set((await criarConsultaDaEscala(tx).funcoesAtivas()).map((funcao) => funcao.codigo));
    const desconhecidas = funcoes.filter((linha) => !cadastradas.has(linha.funcao)).map((linha) => linha.funcao);
    if (desconhecidas.length > 0) throw new RegraDeNegocioError(`Função não cadastrada: ${desconhecidas.join(", ")}.`);

    await repositorio.gravarRegra(tipoEventoId, { antes: tipo.regraVagas, depois: regraDasLinhas(funcoes), usuarioId: ator.usuarioId, instante: agora });
    return { nome: tipo.nome };
  });
}

export type ResultadoDoRecalculo = { eventos: number; alterados: number; avisos: string[] };

/** Recalcula os eventos do tipo ainda em montagem (SEM_ESCALA, RASCUNHO, DEVOLVIDA). Linha confirmada não muda. */
export async function recalcularVagasDoTipo(
  { tipoEventoId }: { tipoEventoId: string },
  { ator, agora }: { ator: AtorDaEscrita; agora: Date },
): Promise<ResultadoDoRecalculo> {
  return escrever(ator, async (tx) => {
    const tipo = await criarRepositorioRegras(tx).travarTipo(tipoEventoId);
    if (!tipo) throw new RegraDeNegocioError("Tipo de evento não encontrado.");
    const eventos = await criarRepositorioRegras(tx).eventosParaRecalcular(tipoEventoId, agora);
    const vagas = criarRepositorioVagas(tx, { usuarioId: ator.usuarioId });
    let alterados = 0;
    const avisos: string[] = [];
    for (const eventoId of eventos) {
      const resultado = await gerarVagasDoEvento(vagas, eventoId);
      if (resultado.situacao === "REGRA_INVALIDA") throw new RegraVagasInvalidaError(resultado.erros);
      if (resultado.situacao === "GERADA") alterados += 1;
      if (resultado.situacao === "GERADA" || resultado.situacao === "SEM_MUDANCA") avisos.push(...resultado.plano.avisos);
    }
    // Um registro do pedido mesmo sem evento mudado (cada evento alterado tem o seu VAGAS_RECALCULADAS).
    await criarRepositorioRegras(tx).registrarRecalculo(tipoEventoId, { eventos: eventos.length, alterados, usuarioId: ator.usuarioId });
    return { eventos: eventos.length, alterados, avisos };
  });
}
