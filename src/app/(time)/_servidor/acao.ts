import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { type Ator, MENSAGEM_ACESSO_NEGADO, type Permissao, pode } from "@/core/autorizacao";
import { logger } from "@/core/logging";
import { mensagemDoErro } from "@/fluxos/_base";

import { lerFormulario, type ResultadoAcao } from "./formulario";
import { obterAtor } from "./usuario-atual";

export {
  dadosDoFormulario,
  type FalhaDaAcao,
  falhaDaValidacao,
  lerFormulario,
  MENSAGEM_FORMULARIO_INVALIDO,
  type ResultadoAcao,
} from "./formulario";
export type { Ator, Permissao } from "@/core/autorizacao";

export { ACAO_NAO_EXECUTADA } from "../_componentes/ui/resultado-acao";

export const MENSAGEM_SEM_SESSAO = "Sua sessão terminou. Entre de novo para continuar.";

type Autorizacao = { ok: true; ator: Ator } | { ok: false; erro: string };

/** Camada 2 da autorização (docs/09 §4.1): ator da requisição com a permissão da action. */
async function autorizar(permissao: Permissao): Promise<Autorizacao> {
  const ator = await obterAtor();
  if (!ator) return { ok: false, erro: MENSAGEM_SEM_SESSAO };
  if (!pode(ator, permissao)) {
    logger.warn({ usuarioId: ator.usuarioId, permissao }, "acesso negado a uma ação");
    return { ok: false, erro: MENSAGEM_ACESSO_NEGADO };
  }
  return { ok: true, ator };
}

/**
 * Sequência fixa de uma server action (docs/07 §2.5 e docs/09 §4.1): ator e permissão → valida o formulário → roda o
 * trabalho (fluxo + revalidatePath) → traduz o erro. A permissão é obrigatória: action sem ela não compila.
 * O trabalho passa o ator ao fluxo (transacao(ator, …) confere a trava 4) e devolve a mensagem de sucesso, no passado. redirect() e notFound() dentro do trabalho seguem para o Next.
 */
export async function executarAcao<S extends z.ZodType>(
  form: FormData,
  schema: S,
  permissao: Permissao,
  trabalho: (dados: z.output<S>, ator: Ator) => Promise<string | void>,
): Promise<ResultadoAcao> {
  // Antes do formulário: quem não pode agir não faz o servidor ler e validar a entrada.
  const autorizacao = await autorizar(permissao);
  if (!autorizacao.ok) return autorizacao;
  const { ator } = autorizacao;

  const lido = lerFormulario(form, schema);
  if (!lido.ok) return lido;

  try {
    const mensagem = await trabalho(lido.dados, ator);
    return mensagem ? { ok: true, mensagem } : { ok: true };
  } catch (erro: unknown) {
    unstable_rethrow(erro);
    return { ok: false, erro: mensagemDoErro(erro) };
  }
}

/**
 * Server action que só lê (prévias): exige sessão e permissão como as outras, mas não passa pela guarda de escrita.
 * Quem chama valida a própria entrada.
 */
export async function executarLeitura<T>(permissao: Permissao, trabalho: (ator: Ator) => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; erro: string }> {
  const autorizacao = await autorizar(permissao);
  if (!autorizacao.ok) return autorizacao;
  try {
    return { ok: true, valor: await trabalho(autorizacao.ator) };
  } catch (erro: unknown) {
    unstable_rethrow(erro);
    return { ok: false, erro: mensagemDoErro(erro) };
  }
}
