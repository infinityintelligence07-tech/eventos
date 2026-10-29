import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { lerConfig } from "@/core/config/leitura";

// Só no servidor (docs/09 §2.2): não há cliente Supabase no navegador, então os cookies da sessão são httpOnly.

export type ConfiguracaoDoLogin = { url: string; chavePublica: string; urlPublica: string | null; producao: boolean };

/** Nulo = login não configurado neste ambiente (o modo local usa "Entrar como"). */
export function configuracaoDoLogin(): ConfiguracaoDoLogin | null {
  let config: ReturnType<typeof lerConfig>;
  try {
    config = lerConfig();
  } catch {
    return null;
  }
  if (!config.NEXT_PUBLIC_SUPABASE_URL || !config.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  return {
    url: config.NEXT_PUBLIC_SUPABASE_URL,
    chavePublica: config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    urlPublica: config.EVENTOS_URL_PUBLICA ?? null,
    producao: config.NODE_ENV === "production",
  };
}

/** Opções aplicadas a todo cookie da sessão, por cima do que o @supabase/ssr sugere. */
export function opcoesDoCookie(producao: boolean): CookieOptions {
  return { httpOnly: true, secure: producao, sameSite: "lax", path: "/" };
}

/** Para Server Components, actions e route handlers. Nulo = login não configurado. */
export async function criarSupabaseDoServidor(): Promise<SupabaseClient | null> {
  const configuracao = configuracaoDoLogin();
  if (!configuracao) return null;
  const loja = await cookies();
  const reforco = opcoesDoCookie(configuracao.producao);
  return createServerClient(configuracao.url, configuracao.chavePublica, {
    cookieOptions: reforco,
    cookies: {
      getAll() {
        return loja.getAll();
      },
      setAll(paraGravar: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of paraGravar) loja.set(name, value, { ...options, ...reforco });
        } catch {
          // Server Component não grava cookie; o middleware renova a sessão.
        }
      },
    },
  });
}
