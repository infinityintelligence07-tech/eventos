"use server";

import { revalidatePath } from "next/cache";

import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { logger } from "@/core/logging";
import { mensagemDoErro } from "@/fluxos/_base";
import { responderEnquete } from "@/fluxos/disponibilidade";
import { staffDaIdentidade } from "@/fluxos/pessoas";
import { caminhoDeResposta, responderEnqueteSchema } from "@/modules/disponibilidade";

// Resposta da enquete pelo próprio staff. Fora do (time): não pede perfil do Eventos, só que o usuário logado seja
// staff. Quem responde sai da sessão a cada envio; do formulário vêm só a enquete e os eventos marcados.

export type ResultadoDaRespostaDaEnquete = { ok: true; podem: number; total: number } | { ok: false; mensagem: string } | null;

export async function responderEnqueteAcao(_anterior: ResultadoDaRespostaDaEnquete, form: FormData): Promise<ResultadoDaRespostaDaEnquete> {
  const sessao = await identidadeDaSessao();
  if (!sessao) return { ok: false, mensagem: "Sua sessão terminou. Entre de novo." };
  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) return { ok: false, mensagem: "Seu usuário não está no cadastro de staff." };

  const leitura = responderEnqueteSchema.safeParse({
    enqueteId: form.get("enqueteId"),
    eventoIds: form.getAll("eventoIds").filter((valor) => typeof valor === "string"),
  });
  if (!leitura.success) return { ok: false, mensagem: "Não foi possível ler a resposta. Recarregue a página e tente de novo." };

  try {
    const resultado = await responderEnquete(leitura.data, { usuarioId: staff.usuarioId, pessoaId: staff.pessoaId, origem: sessao.origem }, new Date());
    revalidatePath(caminhoDeResposta(leitura.data.enqueteId));
    revalidatePath(`/disponibilidade/${leitura.data.enqueteId}`);
    revalidatePath("/disponibilidade");
    return { ok: true, podem: resultado.podem, total: resultado.total };
  } catch (erro: unknown) {
    logger.error({ componente: "responder-enquete", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao gravar a resposta do staff");
    return { ok: false, mensagem: mensagemDoErro(erro) };
  }
}
