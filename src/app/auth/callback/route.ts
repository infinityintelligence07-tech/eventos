import { type NextRequest, NextResponse } from "next/server";

import { configuracaoDoLogin, criarSupabaseDoServidor, destinoSeguro, enderecoAbsoluto } from "@/core/auth";

// Volta do Google (via Supabase, PKCE): troca o código pela sessão e segue para `proximo`, só se for caminho interno.
// Quem decide o acesso é o layout do (time) (docs/09 L2).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parametros = request.nextUrl.searchParams;
  const urlPublica = configuracaoDoLogin()?.urlPublica ?? null;
  const ir = (caminho: string) => NextResponse.redirect(enderecoAbsoluto(caminho, urlPublica, request.nextUrl.origin), { headers: { "Cache-Control": "no-store" } });

  const codigo = parametros.get("code");
  if (!codigo) return ir("/login?erro=falhou");

  const supabase = await criarSupabaseDoServidor();
  if (!supabase) return ir("/login?erro=nao-configurado");

  const { error } = await supabase.auth.exchangeCodeForSession(codigo);
  if (error) return ir("/login?erro=link-expirado");

  return ir(destinoSeguro(parametros.get("proximo")));
}
