"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { modoDemo, modoLocal } from "@/core/ambiente";
import { COOKIE_ATOR_LOCAL, COOKIE_SESSAO, criarSupabaseDoServidor } from "@/core/auth";

/** Botão "Sair" do cabeçalho e da tela Sem acesso. */
export async function sair(): Promise<void> {
  if (modoDemo()) redirect("/inicio");
  const loja = await cookies();
  loja.delete(COOKIE_ATOR_LOCAL);
  loja.delete(COOKIE_SESSAO);
  const supabase = await criarSupabaseDoServidor();
  if (supabase) await supabase.auth.signOut();
  redirect(modoLocal() ? "/entrar-local" : "/login");
}
