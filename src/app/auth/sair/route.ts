import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { modoLocal } from "@/core/ambiente";
import { configuracaoDoLogin, COOKIE_ATOR_LOCAL, criarSupabaseDoServidor, enderecoAbsoluto, motivoDeSaida } from "@/core/auth";

// Encerra a sessão de quem entrou com uma conta sem core.usuario ativo (o layout não consegue apagar cookie e leva a
// /auth/encerrar, que envia este POST). Só POST e só do próprio site: um link ou formulário de outro site não desloga
// ninguém. O destino é fixo; o único parâmetro aceito é o motivo, de uma lista fechada.

/** Sem o cabeçalho (navegador antigo) vale o SameSite=lax dos cookies: POST de outro site chega sem sessão. */
function veioDoProprioSite(request: NextRequest): boolean {
  const origem = request.headers.get("sec-fetch-site");
  return origem === null || origem === "same-origin";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!veioDoProprioSite(request)) return new NextResponse("Pedido recusado.", { status: 403 });

  (await cookies()).delete(COOKIE_ATOR_LOCAL);
  const supabase = await criarSupabaseDoServidor();
  if (supabase) await supabase.auth.signOut();

  const formulario = await request.formData().catch(() => null);
  const motivo = motivoDeSaida(formulario?.get("motivo"));
  const caminho = `${modoLocal() ? "/entrar-local" : "/login"}${motivo ? `?erro=${motivo}` : ""}`;
  const destino = enderecoAbsoluto(caminho, configuracaoDoLogin()?.urlPublica ?? null, request.nextUrl.origin);
  // 303: o navegador segue com GET.
  return NextResponse.redirect(destino, { status: 303, headers: { "Cache-Control": "no-store" } });
}
