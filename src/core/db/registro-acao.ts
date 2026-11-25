import { AsyncLocalStorage } from "node:async_hooks";

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
  | "COMPROVANTE_CUSTO"
  | "PEDIDO_SDC"
  | "HOSPEDAGEM"
  | "CARONA"
  | "REGRA_CUSTO"
  | "MODELO_COPY"
  | "TIPO_EVENTO"
  | "CONFIGURACAO"
  | "PESSOA"
  | "LOCAL"
  | "ENQUETE"
  | "EVENTO"
  | "VAGA";

/**
 * Valores do CHECK registro_acao_origem_check. USUARIO exige usuario_id; SISTEMA (sincronização) não tem autor;
 * SDC exige acesso_sdc_id (a pessoa da agência não tem core.usuario).
 */
export type OrigemDoRegistro = "USUARIO" | "SISTEMA" | "SDC";

/** Quem fez: alguém do time (usuarioId), o sistema (sincronização) ou alguém da SDC (linha de eventos.acesso_sdc). */
export type AutoriaDoRegistro =
  | { origem?: "USUARIO"; usuarioId: string; acessoSdcId?: undefined }
  | { origem: "SISTEMA"; usuarioId?: null; acessoSdcId?: undefined }
  | { origem: "SDC"; acessoSdcId: string; usuarioId?: undefined };

/** Autor de uma ação que tanto o time quanto a SDC podem fazer (registrar a compra de um pedido). */
export type AutorDaAcao = { usuarioId: string } | { acessoSdcId: string };

export function autoriaDe(autor: AutorDaAcao): AutoriaDoRegistro {
  return "acessoSdcId" in autor ? { origem: "SDC", acessoSdcId: autor.acessoSdcId } : { usuarioId: autor.usuarioId };
}

export type EntradaDoRegistro = AutoriaDoRegistro & {
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
  /**
   * Detalhes. Dado pessoal não entra aqui (docs/09 §9.1): o registro é imutável. Para dado pessoal, guarde só o nome
   * do campo que mudou.
   */
  dados?: Record<string, unknown>;
};

// Quantos registros a transação do caso de uso gravou (docs/09 §7.2). Por contexto assíncrono e não pelo `tx`:
// um repositório pode abrir savepoint (tx.transaction) e o registro feito lá dentro também conta.
const contagemDaTransacao = new AsyncLocalStorage<{ quantidade: number }>();

/** Roda o trabalho contando os registrarAcao feitos dentro dele (inclusive em savepoints). */
export async function contandoRegistros<T>(trabalho: () => Promise<T>): Promise<{ resultado: T; registros: number }> {
  const contagem = { quantidade: 0 };
  const resultado = await contagemDaTransacao.run(contagem, trabalho);
  return { resultado, registros: contagem.quantidade };
}

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
    origem: entrada.origem ?? "USUARIO",
    usuarioId: entrada.origem === "SISTEMA" || entrada.origem === "SDC" ? null : entrada.usuarioId,
    acessoSdcId: entrada.origem === "SDC" ? entrada.acessoSdcId : null,
    dados: entrada.dados ?? {},
  });
  const contagem = contagemDaTransacao.getStore();
  if (contagem) contagem.quantidade += 1;
}
