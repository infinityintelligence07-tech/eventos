import type { Executor } from "./database";
import { registroAcao } from "./schema/eventos";

// Histórico só de inclusão (docs/07 §5.2). Chamado pelos repositórios dentro da transação do caso de uso.

/** Valores do CHECK registro_acao_entidade_check. */
export type EntidadeRegistrada =
  | "ESCALA_DO_EVENTO"
  | "CONVOCACAO"
  | "MENSAGEM"
  | "DISPONIBILIDADE"
  | "SOLICITACAO_CUSTO"
  | "PEDIDO_SDC"
  | "HOSPEDAGEM"
  | "CARONA"
  | "REGRA_CUSTO"
  | "MODELO_COPY"
  | "TIPO_EVENTO"
  | "CONFIGURACAO";

export type EntradaDoRegistro = {
  entidade: EntidadeRegistrada;
  entidadeId: string;
  eventoId?: string | null;
  /** Maiúsculas e _, de 3 a 40 caracteres (CHECK no banco). Ex.: ENVIADA_APROVACAO, APROVADA, DEVOLVIDA. */
  acao: string;
  statusDe?: string | null;
  statusPara?: string | null;
  /** Até 2.000 caracteres. */
  comentario?: string | null;
  /** Preenchido = registrado pelo time em nome desta pessoa (selo "Registrado pelo time"). */
  emNomeDePessoaId?: string | null;
  usuarioId: string;
  dados?: Record<string, unknown>;
};

export async function registrarAcao(executor: Executor, entrada: EntradaDoRegistro): Promise<void> {
  await executor.insert(registroAcao).values({
    entidade: entrada.entidade,
    entidadeId: entrada.entidadeId,
    eventoId: entrada.eventoId ?? null,
    acao: entrada.acao,
    statusDe: entrada.statusDe ?? null,
    statusPara: entrada.statusPara ?? null,
    comentario: entrada.comentario ?? null,
    emNomeDePessoaId: entrada.emNomeDePessoaId ?? null,
    usuarioId: entrada.usuarioId,
    dados: entrada.dados ?? {},
  });
}
