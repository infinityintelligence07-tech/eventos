import { type LinhaDaRegra, planejarVagas, type PlanoVagas, planoVazio } from "../domain/plano-vagas";
import { calcularVagas, type Pendencia, RegraVagasInvalidaError, type Vaga } from "../domain/vagas";

// Gera (ou recalcula) as vagas da escala de um evento a partir da regra do tipo.
// Só cria vagas, sem pessoas: a escala fica em RASCUNHO para o time completar.

export type EventoParaVagas = {
  id: string;
  status: string;
  statusEscala: string;
  regraVagas: unknown;
  expectativaPublico: number | null;
  pessoasNaFila: number | null;
};

/** O que o serviço precisa do banco, tudo dentro de uma transação com o evento travado. */
export type TransacaoVagas = {
  evento: EventoParaVagas;
  linhasDaRegra: LinhaDaRegra[];
  aplicar(plano: PlanoVagas): Promise<{ funcoesNaoCadastradas: string[] }>;
};

export type RepositorioVagas = {
  comEventoTravado<T>(eventoId: string, trabalho: (transacao: TransacaoVagas | null) => Promise<T>): Promise<T>;
};

export type ResultadoGerarVagas =
  | { situacao: "NAO_ENCONTRADO" | "ESCALA_APROVADA" | "EVENTO_ENCERRADO" }
  | { situacao: "REGRA_INVALIDA"; erros: string[] }
  | {
      situacao: "GERADA" | "SEM_MUDANCA";
      vagas: Vaga[];
      pendencias: Pendencia[];
      plano: PlanoVagas;
      funcoesNaoCadastradas: string[];
    };

// Com a líder (AGUARDANDO_APROVACAO) a escala fica travada até aprovar ou devolver (docs/07 §4.1).
const ESCALA_FECHADA = new Set(["AGUARDANDO_APROVACAO", "APROVADA", "COMUNICADA"]);
const EVENTO_ENCERRADO = new Set(["CANCELADO", "CONCLUIDO"]);

export async function gerarVagasDoEvento(repositorio: RepositorioVagas, eventoId: string): Promise<ResultadoGerarVagas> {
  return repositorio.comEventoTravado(eventoId, async (transacao): Promise<ResultadoGerarVagas> => {
    if (!transacao) return { situacao: "NAO_ENCONTRADO" };
    const { evento } = transacao;

    // Escala aprovada só muda pela mão do time (a aprovação registra o que foi aprovado).
    if (ESCALA_FECHADA.has(evento.statusEscala)) return { situacao: "ESCALA_APROVADA" };
    if (EVENTO_ENCERRADO.has(evento.status)) return { situacao: "EVENTO_ENCERRADO" };

    let resultado;
    try {
      resultado = calcularVagas(evento.regraVagas, {
        expectativa_publico: evento.expectativaPublico,
        pessoas_na_fila: evento.pessoasNaFila,
      });
    } catch (cause: unknown) {
      if (cause instanceof RegraVagasInvalidaError) return { situacao: "REGRA_INVALIDA", erros: cause.erros };
      throw cause;
    }

    const plano = planejarVagas(transacao.linhasDaRegra, resultado);
    if (planoVazio(plano)) {
      return { situacao: "SEM_MUDANCA", ...resultado, plano, funcoesNaoCadastradas: [] };
    }
    const { funcoesNaoCadastradas } = await transacao.aplicar(plano);
    return { situacao: "GERADA", ...resultado, plano, funcoesNaoCadastradas };
  });
}
