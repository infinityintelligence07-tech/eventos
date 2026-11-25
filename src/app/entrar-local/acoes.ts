"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { entradaLocalLiberada } from "@/app/(time)/_servidor/usuario-atual";
import { COOKIE_ATOR_LOCAL, DURACAO_DO_COOKIE_LOCAL_EM_SEGUNDOS, resolverAcessoPorId } from "@/core/auth";
import { bancoParaLeitura } from "@/fluxos/_base";

const entrarComoSchema = z.object({ usuarioId: z.uuid() });

/** Só no modo local com as três travas abertas: grava o usuário escolhido e segue as mesmas regras do login real. */
export async function entrarComo(form: FormData): Promise<void> {
  if (!(await entradaLocalLiberada())) notFound();
  const lido = entrarComoSchema.safeParse({ usuarioId: form.get("usuarioId") });
  if (!lido.success) redirect("/entrar-local?erro=invalido");

  // O id é de um usuário de teste (core.usuario) ou de um e-mail de teste da SDC (eventos.acesso_sdc).
  const resolucao = await resolverAcessoPorId(lido.data.usuarioId, await bancoParaLeitura());
  if (resolucao.situacao === "SEM_CADASTRO") redirect("/entrar-local?erro=invalido");

  (await cookies()).set(COOKIE_ATOR_LOCAL, lido.data.usuarioId, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_DO_COOKIE_LOCAL_EM_SEGUNDOS,
  });
  redirect(resolucao.situacao === "OK" ? "/inicio" : resolucao.situacao === "SDC" ? "/sdc" : "/sem-acesso");
}
