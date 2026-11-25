import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { lerFormulario, type ResultadoAcao } from "@/app/(time)/_servidor/formulario";
import type { AtorSdc } from "@/core/auth";
import { logger } from "@/core/logging";
import { mensagemDoErro } from "@/fluxos/_base";

import { obterAtorSdc } from "./ator-sdc";

export const MENSAGEM_SEM_ACESSO_DA_SDC = "Seu acesso terminou ou foi desativado. Entre de novo para continuar.";

/**
 * Sequência fixa de uma server action da área da SDC (o par de executarAcao do time, docs/09 §4.1 e §15): confere que
 * quem chama é um ator SDC ativo (lido do banco agora) → valida o formulário → roda o trabalho → traduz o erro.
 * Não recebe permissão do time: a SDC não tem perfil; o que ela pode fazer é só o que as actions de /sdc oferecem.
 * Alguém do time (ou qualquer outra sessão) chamando uma action da SDC é recusado aqui, antes de ler o formulário.
 */
export async function executarAcaoDaSdc<S extends z.ZodType>(form: FormData, schema: S, trabalho: (dados: z.output<S>, sdc: AtorSdc) => Promise<string | void>): Promise<ResultadoAcao> {
  const sdc = await obterAtorSdc();
  if (!sdc) {
    logger.warn({ componente: "sdc" }, "action da SDC chamada por quem não é SDC");
    return { ok: false, erro: MENSAGEM_SEM_ACESSO_DA_SDC };
  }

  const lido = lerFormulario(form, schema);
  if (!lido.ok) return lido;

  try {
    const mensagem = await trabalho(lido.dados, sdc);
    return mensagem ? { ok: true, mensagem } : { ok: true };
  } catch (erro: unknown) {
    unstable_rethrow(erro);
    return { ok: false, erro: mensagemDoErro(erro) };
  }
}
