import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { lerConfig } from "@/core/config/leitura";

// Só autentica (docs/09 L2): renova a sessão do Supabase e manda para /login quem não tem. Quem decide o acesso é o
// servidor (layout do (time), executarAcao e o fluxo). Roda no edge: não importa banco nem @/core/auth (que lê o banco).
// No modo local não fala com o Supabase; o layout leva para "Entrar como".

function paraOLogin(request: NextRequest): NextResponse {
  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = "";
  const proximo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (proximo !== "/") destino.searchParams.set("proximo", proximo);
  return NextResponse.redirect(destino);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let config: ReturnType<typeof lerConfig>;
  try {
    config = lerConfig();
  } catch {
    return paraOLogin(request);
  }
  if (config.EVENTOS_MODO === "local") return NextResponse.next();
  if (!config.NEXT_PUBLIC_SUPABASE_URL || !config.NEXT_PUBLIC_SUPABASE_ANON_KEY) return paraOLogin(request);

  const reforco: CookieOptions = { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", path: "/" };
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: reforco,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of paraGravar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) resposta.cookies.set(name, value, { ...options, ...reforco });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return paraOLogin(request);
  return resposta;
}

export const config = {
  // Tudo, menos a entrada, o callback, a saúde e os arquivos estáticos.
  matcher: ["/((?!login(?:/|$)|auth/callback(?:/|$)|api/health(?:/|$)|_next/|images/|favicon).*)"],
};
