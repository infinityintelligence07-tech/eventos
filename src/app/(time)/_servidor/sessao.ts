"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { modoLocal } from "@/core/ambiente";
import { COOKIE_ATOR_LOCAL, criarSupabaseDoServidor } from "@/core/auth";

/** Botão "Sair" do cabeçalho e da tela Sem acesso. */
export async function sair(): Promise<void> {
  (await cookies()).delete(COOKIE_ATOR_LOCAL);
  const supabase = await criarSupabaseDoServidor();
  if (supabase) await supabase.auth.signOut();
  redirect(modoLocal() ? "/entrar-local" : "/login");
}
