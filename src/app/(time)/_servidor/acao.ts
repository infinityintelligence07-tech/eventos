import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { MENSAGEM_ESCRITA_DESLIGADA, mensagemDoErro } from "@/fluxos/_base";

import { lerFormulario, type ResultadoAcao } from "./formulario";
import { type UsuarioAtual, usuarioAtual } from "./usuario-atual";

export {
  dadosDoFormulario,
  type FalhaDaAcao,
  falhaDaValidacao,
  lerFormulario,
  MENSAGEM_FORMULARIO_INVALIDO,
  type ResultadoAcao,
} from "./formulario";
export { type UsuarioAtual, usuarioAtual } from "./usuario-atual";

export { ACAO_NAO_EXECUTADA } from "../_componentes/ui/resultado-acao";

/**
 * Sequência fixa de uma server action (docs/07 §2.5): confere o usuário → valida o formulário → roda o trabalho
 * (fluxo + revalidatePath) → traduz o erro. O trabalho devolve a mensagem de sucesso, no passado.
 * redirect() e notFound() dentro do trabalho seguem para o Next.
 */
export async function executarAcao<S extends z.ZodType>(
  form: FormData,
  schema: S,
  trabalho: (dados: z.output<S>, usuario: UsuarioAtual) => Promise<string | void>,
): Promise<ResultadoAcao> {
  // Usuário antes do formulário: quem não pode escrever não chega a fazer o servidor ler e validar a entrada.
  const usuario = await usuarioAtual();
  if (!usuario) return { ok: false, erro: MENSAGEM_ESCRITA_DESLIGADA };

  const lido = lerFormulario(form, schema);
  if (!lido.ok) return lido;

  try {
    const mensagem = await trabalho(lido.dados, usuario);
    return mensagem ? { ok: true, mensagem } : { ok: true };
  } catch (erro: unknown) {
    unstable_rethrow(erro);
    return { ok: false, erro: mensagemDoErro(erro) };
  }
}
