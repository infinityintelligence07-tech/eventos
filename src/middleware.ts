import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Direto do arquivo: o índice de @/core/auth lê o banco e não roda no edge.
import { tokenDeChaveAssimetrica } from "@/core/auth/token";
import { lerConfig } from "@/core/config/leitura";

/** Mesmo nome de src/core/auth/sessao-propria.ts (que usa node:crypto e não roda no edge). */
const COOKIE_SESSAO = "eventos_sessao";

// Só cuida da sessão (docs/09 L2 e §2.3): renova o token do Supabase que está para vencer e manda para /login quem não
// tem sessão. NÃO pergunta ao Supabase Auth quem é o usuário: essa ida pela rede acontece uma vez por requisição, no
// servidor (usuario-atual.ts), que é quem decide o acesso (layout, executarAcao e o fluxo). Nada daqui decide acesso.
// Roda no edge: não importa banco nem o índice de @/core/auth (que lê o banco).
// No modo local não fala com o Supabase; o layout leva para "Entrar como". Na demo (sem login) também não.

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
  if (config.EVENTOS_MODO === "local" || config.EVENTOS_MODO === "demo") return NextResponse.next();
  // Login com e-mail e senha (docs/10): o cookie é conferido (assinatura e validade) pelo layout e pelas actions.
  if (config.EVENTOS_SESSAO_SEGREDO && request.cookies.has(COOKIE_SESSAO)) return NextResponse.next();
  if (!config.NEXT_PUBLIC_SUPABASE_URL || !config.NEXT_PUBLIC_SUPABASE_ANON_KEY) return paraOLogin(request);

  const reforco: CookieOptions = { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", path: "/" };
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: reforco,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar: { name: string; value: string; options: CookieOptions }[], cabecalhos?: Record<string, string>) {
        // O token renovado vai para o pedido (o servidor já lê o novo) e para a resposta (o navegador guarda).
        for (const { name, value } of paraGravar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) resposta.cookies.set(name, value, { ...options, ...reforco });
        // Resposta que troca cookie de sessão não pode ficar em cache de proxy (o @supabase/ssr manda os cabeçalhos).
        for (const [nome, valor] of Object.entries(cabecalhos ?? {})) resposta.headers.set(nome, valor);
      },
    },
  });

  // getSession() lê o cookie e, se o token está para vencer, renova (aí sim vai ao Auth e grava os cookies novos).
  // Não confere o token: por isso só serve para renovar e para poupar a viagem de quem nem cookie tem.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return paraOLogin(request);

  // Projeto com chave de assinatura assimétrica: o getClaims() confere a assinatura aqui mesmo, com a chave pública
  // (em memória), e token adulterado nem chega ao servidor. Com segredo simétrico ele iria ao Auth (a ida repetida que
  // este arquivo deixou de fazer), então não é chamado: o servidor confere. Erro que não seja "token inválido" (chave
  // pública fora do ar, por exemplo) deixa passar: o servidor decide, e ele falha fechado.
  if (tokenDeChaveAssimetrica(session.access_token)) {
    try {
      const { error } = await supabase.auth.getClaims(session.access_token);
      if (error?.name === "AuthInvalidJwtError") return paraOLogin(request);
    } catch {
      // segue para o servidor
    }
  }
  return resposta;
}

export const config = {
  // Tudo, menos a entrada, o callback, a saúde e os arquivos estáticos.
  matcher: ["/((?!login(?:/|$)|auth/callback(?:/|$)|api/health(?:/|$)|api/versao(?:/|$)|_next/|images/|icons/|favicon|icon\\.png|apple-icon\\.png|manifest\\.webmanifest).*)"],
};
