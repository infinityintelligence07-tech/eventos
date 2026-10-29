"use server";

import { redirect } from "next/navigation";

import { configuracaoDoLogin, criarSupabaseDoServidor, destinoSeguro } from "@/core/auth";

/** "Entrar com Google": abre o OAuth do Supabase (PKCE; o verificador fica em cookie) e volta por /auth/callback. */
export async function entrarComGoogle(form: FormData): Promise<void> {
  const configuracao = configuracaoDoLogin();
  const supabase = await criarSupabaseDoServidor();
  // O redirectTo é montado com EVENTOS_URL_PUBLICA, nunca com o Host da requisição.
  if (!configuracao?.urlPublica || !supabase) redirect("/login?erro=nao-configurado");

  const proximo = destinoSeguro(typeof form.get("proximo") === "string" ? (form.get("proximo") as string) : null);
  const retorno = new URL("/auth/callback", configuracao.urlPublica);
  retorno.searchParams.set("proximo", proximo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: retorno.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?erro=falhou");
  redirect(data.url);
}
