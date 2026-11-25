import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

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

// Uma ida ao Supabase Auth por requisição (docs/09 §2.3). Conferir a sessão é uma chamada de rede (GET /user) e a mesma
// requisição pergunta mais de uma vez pelo mesmo token: a server action e a tela que ela redesenha, o getUser() e o
// getUser() que o getClaims() faz por dentro quando a chave do projeto é simétrica. A primeira resposta vale para o
// resto DESTA requisição e só para ESTE token. A memória fica presa ao objeto de cabeçalhos da requisição (o mesmo
// durante a action e a renderização) e some com ele: nada passa de uma requisição para outra, então sessão encerrada
// no Supabase cai na requisição seguinte, como antes. O acesso (usuário ativo, perfil, lista da SDC) não fica aqui:
// continua lido do banco em cada action e em cada renderização.
type RespostaDoAuth = { status: number; statusText: string; cabecalhos: [string, string][]; corpo: string };
const respostasDoAuth = new WeakMap<object, Map<string, Promise<RespostaDoAuth>>>();

/** Cabeçalhos que descrevem o corpo como veio pela rede (comprimido), não o texto guardado. */
const CABECALHOS_DO_TRANSPORTE = new Set(["content-encoding", "content-length", "transfer-encoding"]);

async function guardar(resposta: Response): Promise<RespostaDoAuth> {
  return {
    status: resposta.status,
    statusText: resposta.statusText,
    cabecalhos: [...resposta.headers.entries()].filter(([nome]) => !CABECALHOS_DO_TRANSPORTE.has(nome.toLowerCase())),
    corpo: await resposta.text(),
  };
}

/**
 * `fetch` do cliente Supabase de uma requisição: o GET /auth/v1/user do mesmo token vai uma vez só pela rede; todo o
 * resto (renovar o token, sair, chaves públicas) passa direto. `requisicao` é a âncora: o objeto que o Next entrega em
 * headers(), um por requisição. Se um dia ele mudar a cada chamada, isto só deixa de lembrar (volta a perguntar).
 */
export function buscaDaRequisicao(requisicao: object, urlDoSupabase: string): typeof fetch {
  // O mesmo endereço que o supabase-js monta para o Auth (URL do projeto + auth/v1).
  const enderecoDoUsuario = `${new URL("auth/v1", urlDoSupabase.endsWith("/") ? urlDoSupabase : `${urlDoSupabase}/`).href}/user`;
  return async (entrada, opcoes) => {
    const token = new Headers(opcoes?.headers).get("authorization");
    if (entrada !== enderecoDoUsuario || (opcoes?.method ?? "GET").toUpperCase() !== "GET" || !token) return fetch(entrada, opcoes);

    const respostas = respostasDoAuth.get(requisicao) ?? new Map<string, Promise<RespostaDoAuth>>();
    respostasDoAuth.set(requisicao, respostas);
    let guardada = respostas.get(token);
    if (!guardada) {
      const pedida = fetch(entrada, opcoes).then(guardar);
      guardada = pedida;
      respostas.set(token, pedida);
      // Falha de rede não fica guardada: a próxima leitura tenta de novo.
      pedida.catch(() => {
        if (respostas.get(token) === pedida) respostas.delete(token);
      });
    }
    // Cada leitora recebe uma Response própria: o corpo de uma Response só pode ser lido uma vez.
    const { status, statusText, cabecalhos, corpo } = await guardada;
    return new Response(corpo === "" ? null : corpo, { status, statusText, headers: cabecalhos });
  };
}

/** Para Server Components, actions e route handlers. Nulo = login não configurado. */
export async function criarSupabaseDoServidor(): Promise<SupabaseClient | null> {
  const configuracao = configuracaoDoLogin();
  if (!configuracao) return null;
  const loja = await cookies();
  const reforco = opcoesDoCookie(configuracao.producao);
  return createServerClient(configuracao.url, configuracao.chavePublica, {
    global: { fetch: buscaDaRequisicao(await headers(), configuracao.url) },
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
