import { createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Quantas vezes UMA requisição vai pela rede até o Supabase Auth (docs/09 §2.3). O servidor do app e o Supabase ficam
// em regiões diferentes: cada ida custa cerca de 245 ms, então conferir a mesma sessão duas ou três vezes por página
// era a maior parte da demora de carregar e de salvar.
//
// Aqui rodam de verdade o middleware, o cliente do @supabase/ssr / @supabase/auth-js e as portas do servidor
// (exigirAtor, executarAcao, exigirAtorSdc, executarAcaoDaSdc, identidadeDaSessao, staffDaSessao). De mentira são só:
//   - o Supabase Auth (o `fetch` global vira um servidor que conta os pedidos por endereço);
//   - o banco (a decisão de quem entrou vira uma tabela em memória, que também conta as leituras);
//   - o Next: cookies()/headers() de uma requisição simulada; o cache() do React, que memoriza dentro de uma
//     renderização e chama direto fora dela (server action e route handler), como no react.react-server; e o `fetch`
//     global, que dentro de uma renderização junta os GET idênticos (dedupe-fetch do Next).
//
// Depois da mudança: 1 GET /user por requisição em todos os casos. Se alguém voltar a duplicar, este teste falha.

/**
 * GET /user por requisição ANTES da mudança, medido com este mesmo arquivo sobre o commit 0e47646 (o middleware
 * perguntava ao Auth e o servidor perguntava de novo: uma vez na action e outra na tela que ela redesenha).
 * Sem o dedupe de `fetch` do Next dentro da renderização seriam 3, 4, 3 (ou 2), 5 (ou 3), 2, 3 e 2.
 */
const ANTES_DA_MUDANCA = {
  HS256: { paginaDoTime: 2, actionDoTime: 3, paginaDaSdc: 2, actionDaSdc: 4, paginaDoStaff: 2, actionDoStaff: 3, rotaDoStaff: 2 },
  ES256: { paginaDoTime: 2, actionDoTime: 3, paginaDaSdc: 2, actionDaSdc: 3, paginaDoStaff: 2, actionDoStaff: 3, rotaDoStaff: 2 },
} as const;

const SUPABASE = "https://projeto-de-teste.supabase.test";
const EVENTOS = "https://eventos.exemplo.test";

const ambienteOriginal = vi.hoisted(() => {
  const nomes = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "EVENTOS_URL_PUBLICA", "EVENTOS_MODO", "EVENTOS_SESSAO_SEGREDO"] as const;
  const original = Object.fromEntries(nomes.map((nome) => [nome, process.env[nome]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto-de-teste.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-publica-de-teste";
  process.env.EVENTOS_URL_PUBLICA = "https://eventos.exemplo.test";
  delete process.env.EVENTOS_MODO;
  delete process.env.EVENTOS_SESSAO_SEGREDO;
  return original;
});

type Cookie = { name: string; value: string; options?: { maxAge?: number; httpOnly?: boolean; sameSite?: unknown; path?: string } };

const cena = vi.hoisted(() => ({
  /** A requisição que o servidor está atendendo: o que cookies() e headers() do Next devolvem. */
  pedido: null as null | { loja: unknown; cabecalhos: Headers },
  /** Renderização em curso (memória do cache() do React). Nulo = fora de renderização: server action ou route handler. */
  render: null as null | Map<unknown, Map<string, unknown>>,
  /** O "banco": quem é cada e-mail agora e quantas vezes a decisão foi lida. */
  cadastro: new Map<string, "TIME" | "SDC" | "SEM_PERFIL" | "STAFF">(),
  leiturasDoBanco: 0,
}));

vi.mock("next/headers", () => ({ cookies: async () => cena.pedido!.loja, headers: async () => cena.pedido!.cabecalhos }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT ${destino}`);
  },
  unstable_rethrow: () => undefined,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cache:
    <A extends unknown[], R>(funcao: (...argumentos: A) => R) =>
    (...argumentos: A): R => {
      if (!cena.render) return funcao(...argumentos);
      const daFuncao = cena.render.get(funcao) ?? new Map<string, unknown>();
      cena.render.set(funcao, daFuncao);
      const chave = JSON.stringify(argumentos);
      if (!daFuncao.has(chave)) daFuncao.set(chave, funcao(...argumentos));
      return daFuncao.get(chave) as R;
    },
}));
vi.mock("@/core/ambiente", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), modoLocal: () => false, modoDemo: () => false }));
vi.mock("@/fluxos/_base", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  bancoParaLeitura: async () => ({}),
  situacaoDaEscrita: async () => ({ liberada: true, modo: "PRODUCAO" }),
}));
vi.mock("@/fluxos/pessoas", () => ({
  staffDaIdentidade: async (identidade: { email?: string }) => {
    cena.leiturasDoBanco += 1;
    return identidade.email && cena.cadastro.get(identidade.email) === "STAFF" ? { usuarioId: "usuario-do-staff", pessoaId: "pessoa-do-staff" } : null;
  },
}));
vi.mock("@/core/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/auth")>();
  return {
    ...original,
    segredoDaSessao: () => null,
    // A decisão continua sendo do "banco", lida em cada chamada; a regra da sessão do Google (pelaContaGoogle) roda de verdade.
    resolverAcessoPorEmail: async (email: string, _executor: unknown, { pelaContaGoogle }: { pelaContaGoogle: () => Promise<boolean> }) => {
      cena.leiturasDoBanco += 1;
      const normalizado = original.normalizarEmail(email);
      const quem = cena.cadastro.get(normalizado);
      if (quem === "TIME") return { situacao: "OK", ator: { usuarioId: "usuario-do-time", pessoaId: null, nome: "Do Time", email: normalizado, perfis: ["EVENTOS_TIME"], origem: "SESSAO" } };
      if (quem === "SEM_PERFIL") return { situacao: "SEM_PERFIL", email: normalizado };
      if (quem === "SDC" && (await pelaContaGoogle()) === true) return { situacao: "SDC", sdc: { acessoSdcId: "acesso-da-sdc", nome: "SDC (teste)", email: normalizado, origem: "SESSAO" } };
      return { situacao: "SEM_CADASTRO" };
    },
  };
});

const { middleware } = await import("@/middleware");
const { exigirAtor, identidadeDaSessao, permissoesDoAtor, situacaoDoAtor } = await import("@/app/(time)/_servidor/usuario-atual");
const { executarAcao } = await import("@/app/(time)/_servidor/acao");
const { exigirAtorSdc } = await import("@/app/sdc/_servidor/ator-sdc");
const { executarAcaoDaSdc } = await import("@/app/sdc/_servidor/acao");
const { staffDaSessao } = await import("@/app/solicitar-custo/_servidor/sessao");
const { staffDaIdentidade } = await import("@/fluxos/pessoas");
const { buscaDaRequisicao } = await import("@/core/auth");

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [nome, valor] of Object.entries(ambienteOriginal)) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Supabase Auth de mentira: confere o token como o de verdade (conhecido e não encerrado) e conta cada pedido.

type Usuario = { id: string; email: string; confirmado?: boolean; provedor?: "google" | "email" };
type Chave = "HS256" | "ES256";

const base64url = (dado: Buffer | string) => Buffer.from(dado).toString("base64url");
const parDeChaves = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "chave-de-teste-1";

const supabase = {
  /** Tokens que o Auth aceita: token → usuário. Tirar daqui = sessão encerrada (sair em outro lugar, usuário banido…). */
  sessoes: new Map<string, Usuario>(),
  renovacoes: new Map<string, { usuario: Usuario; chave: Chave; metodo: string }>(),
  idas: { usuario: 0, renovacao: 0, chaves: 0 },
  /** O último token que alguém pediu para conferir (GET /user). */
  ultimoConferido: null as string | null,
  chavesNoAr: true,

  emitir(usuario: Usuario, chave: Chave, { validadeEmSegundos = 3600, metodo = "oauth", registrar = true } = {}): { access_token: string; refresh_token: string } {
    const agora = Math.floor(Date.now() / 1000);
    const cabecalho = chave === "HS256" ? { alg: "HS256", typ: "JWT" } : { alg: "ES256", typ: "JWT", kid: KID };
    const corpo = {
      iss: `${SUPABASE}/auth/v1`,
      sub: usuario.id,
      aud: "authenticated",
      role: "authenticated",
      email: usuario.email,
      iat: agora,
      exp: agora + validadeEmSegundos,
      session_id: randomBytes(8).toString("hex"),
      is_anonymous: false,
      amr: [{ method: metodo, timestamp: agora }],
    };
    const assinado = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`;
    const assinatura = chave === "HS256" ? randomBytes(32) : createSign("SHA256").update(assinado).sign({ key: parDeChaves.privateKey, dsaEncoding: "ieee-p1363" });
    const access_token = `${assinado}.${base64url(assinatura)}`;
    const refresh_token = randomBytes(12).toString("hex");
    if (registrar) this.sessoes.set(access_token, usuario);
    this.renovacoes.set(refresh_token, { usuario, chave, metodo });
    return { access_token, refresh_token };
  },

  usuarioEmJson(usuario: Usuario) {
    return {
      id: usuario.id,
      aud: "authenticated",
      role: "authenticated",
      email: usuario.email,
      email_confirmed_at: usuario.confirmado === false ? null : "2026-11-25T12:00:00Z",
      is_anonymous: false,
      app_metadata: { provider: usuario.provedor ?? "google", providers: [usuario.provedor ?? "google"] },
      user_metadata: {},
      identities: [{ provider: usuario.provedor ?? "google", identity_data: { email: usuario.email, email_verified: true } }],
      created_at: "2026-11-01T12:00:00Z",
    };
  },

  async responder(entrada: RequestInfo | URL, opcoes?: RequestInit): Promise<Response> {
    const url = new URL(String(entrada));
    const metodo = (opcoes?.method ?? "GET").toUpperCase();
    const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
    if (url.origin !== SUPABASE) throw new Error(`pedido de rede inesperado: ${metodo} ${url.href}`);

    if (url.pathname === "/auth/v1/user" && metodo === "GET") {
      supabase.idas.usuario += 1;
      const token = new Headers(opcoes?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
      supabase.ultimoConferido = token;
      const usuario = supabase.sessoes.get(token);
      return usuario ? json(supabase.usuarioEmJson(usuario)) : json({ code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" }, 403);
    }
    if (url.pathname === "/auth/v1/token" && metodo === "POST" && url.searchParams.get("grant_type") === "refresh_token") {
      supabase.idas.renovacao += 1;
      const { refresh_token } = JSON.parse(String(opcoes?.body)) as { refresh_token: string };
      const conhecida = supabase.renovacoes.get(refresh_token);
      if (!conhecida) return json({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }, 400);
      supabase.renovacoes.delete(refresh_token);
      const nova = supabase.emitir(conhecida.usuario, conhecida.chave, { metodo: conhecida.metodo });
      return json({ ...nova, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: supabase.usuarioEmJson(conhecida.usuario) });
    }
    if (url.pathname === "/auth/v1/.well-known/jwks.json" && metodo === "GET") {
      supabase.idas.chaves += 1;
      if (!supabase.chavesNoAr) return json({ message: "fora do ar" }, 503);
      return json({ keys: [{ ...parDeChaves.publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] }] });
    }
    throw new Error(`pedido de rede inesperado: ${metodo} ${url.href}`);
  },
};

/**
 * O `fetch` global dentro do Next (next/dist/server/lib/dedupe-fetch.js, sobre o cache() do React): durante uma
 * renderização, GET idêntico (mesmo endereço e mesmos cabeçalhos) vai uma vez só pela rede; fora dela (server action,
 * route handler, middleware) cada chamada vai. Só o que passa daqui conta como ida ao Supabase Auth.
 */
const iguaisDaRenderizacao = new WeakMap<object, Map<string, Promise<Response>>>();
function fetchDoNext(entrada: RequestInfo | URL, opcoes?: RequestInit): Promise<Response> {
  const metodo = (opcoes?.method ?? "GET").toUpperCase();
  if (!cena.render || opcoes?.signal || (metodo !== "GET" && metodo !== "HEAD")) return supabase.responder(entrada, opcoes);
  const iguais = iguaisDaRenderizacao.get(cena.render) ?? new Map<string, Promise<Response>>();
  iguaisDaRenderizacao.set(cena.render, iguais);
  const chave = JSON.stringify([metodo, String(entrada), [...new Headers(opcoes?.headers).entries()]]);
  if (!iguais.has(chave)) iguais.set(chave, supabase.responder(entrada, opcoes));
  return iguais.get(chave)!.then((resposta) => resposta.clone());
}
vi.stubGlobal("fetch", fetchDoNext);

// ---------------------------------------------------------------------------------------------------------------------
// Navegador e requisição simulados.

/** Os cookies que o navegador guarda entre uma requisição e outra. */
function novoNavegador() {
  const cookies = new Map<string, string>();
  const recebidos: Cookie[] = [];
  return {
    recebidos,
    receber(lista: Cookie[]) {
      for (const cookie of lista) {
        recebidos.push(cookie);
        if (cookie.value === "" || cookie.options?.maxAge === 0) cookies.delete(cookie.name);
        else cookies.set(cookie.name, cookie.value);
      }
    },
    cabecalho: () => [...cookies].map(([nome, valor]) => `${nome}=${valor}`).join("; "),
    /** A sessão guardada no cookie (o @supabase/ssr grava em base64url e, se for grande, em pedaços .0, .1…). */
    sessao(): { access_token: string } | null {
      const juntos = [...cookies].sort(([a], [b]) => a.localeCompare(b)).map(([, valor]) => valor).join("");
      return juntos ? (JSON.parse(Buffer.from(juntos.replace(/^base64-/, ""), "base64url").toString("utf8")) as { access_token: string }) : null;
    },
    tokenDeAcesso(): string | null {
      return this.sessao()?.access_token ?? null;
    },
    /** Adultera o cookie: a mesma sessão, com outro token de acesso. */
    trocarTokenDeAcesso(token: string) {
      const nome = [...cookies.keys()][0]!.replace(/\.\d+$/, "");
      const adulterada = `base64-${base64url(JSON.stringify({ ...this.sessao(), access_token: token }))}`;
      cookies.clear();
      cookies.set(nome, adulterada);
    },
  };
}
type Navegador = ReturnType<typeof novoNavegador>;

/** Login de verdade pela biblioteca: é ela que escreve o cookie da sessão, no formato que o app vai ler. */
async function entrar(usuario: Usuario, chave: Chave, opcoes: { validadeEmSegundos?: number; metodo?: string } = {}): Promise<Navegador> {
  const navegador = novoNavegador();
  const cliente = createServerClient(SUPABASE, "chave-publica-de-teste", { cookies: { getAll: () => [], setAll: (lista) => navegador.receber(lista) } });
  const { error } = await cliente.auth.setSession(supabase.emitir(usuario, chave, opcoes));
  expect(error).toBeNull();
  expect(navegador.tokenDeAcesso()).not.toBeNull();
  return navegador;
}

/** A loja de cookies do Next: só server action e route handler gravam; Server Component lança. */
function lojaDeCookies(cabecalho: string) {
  const valores = new Map<string, string>();
  for (const par of cabecalho.split(/;\s*/).filter(Boolean)) valores.set(par.slice(0, par.indexOf("=")), par.slice(par.indexOf("=") + 1));
  const loja = {
    gravavel: false,
    gravados: [] as Cookie[],
    get: (nome: string) => (valores.has(nome) ? { name: nome, value: valores.get(nome)! } : undefined),
    getAll: () => [...valores].map(([name, value]) => ({ name, value })),
    has: (nome: string) => valores.has(nome),
    set(name: string, value: string, options?: Cookie["options"]) {
      if (!loja.gravavel) throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
      if (value === "" || options?.maxAge === 0) valores.delete(name);
      else valores.set(name, value);
      loja.gravados.push({ name, value, options });
    },
    delete(name: string) {
      loja.set(name, "", { maxAge: 0 });
    },
  };
  return loja;
}

type Fases = {
  /** Server action ou route handler: grava cookie e o cache() do React não memoriza. */
  action: <T>(trabalho: () => Promise<T>) => Promise<T>;
  /** Uma renderização (layout + generateMetadata + página): cookie só de leitura e cache() memorizando. */
  renderizar: <T>(trabalho: () => Promise<T>) => Promise<T>;
};

type Resposta<T> = { idas: typeof supabase.idas; leiturasDoBanco: number; cacheDoMiddleware: string | null } & ({ parouNoMiddleware: string } | { parouNoMiddleware: null; valor: T });

/** Uma requisição HTTP inteira: o middleware e, se ele deixar passar, o servidor (com os cookies que o middleware reescreveu). */
async function requisicao<T>(navegador: Navegador, caminho: string, noServidor: (fases: Fases) => Promise<T>): Promise<Resposta<T>> {
  const antes = { ...supabase.idas };
  const leiturasAntes = cena.leiturasDoBanco;

  const cookieDoNavegador = navegador.cabecalho();
  const pedido = new NextRequest(`${EVENTOS}${caminho}`, { headers: cookieDoNavegador ? { cookie: cookieDoNavegador } : {} });
  const resposta = await middleware(pedido);
  const contagem = () => ({
    idas: { usuario: supabase.idas.usuario - antes.usuario, renovacao: supabase.idas.renovacao - antes.renovacao, chaves: supabase.idas.chaves - antes.chaves },
    leiturasDoBanco: cena.leiturasDoBanco - leiturasAntes,
    cacheDoMiddleware: resposta.headers.get("cache-control"),
  });
  navegador.receber(resposta.cookies.getAll().map(({ name, value, ...options }) => ({ name, value, options })));
  const destino = resposta.headers.get("location");
  if (destino) return { ...contagem(), parouNoMiddleware: new URL(destino).pathname };

  // O Next entrega ao servidor os cabeçalhos que o middleware reescreveu no pedido (NextResponse.next({ request })).
  const loja = lojaDeCookies(resposta.headers.get("x-middleware-request-cookie") ?? cookieDoNavegador);
  cena.pedido = { loja, cabecalhos: new Headers(pedido.headers) };
  const fases: Fases = {
    action: async (trabalho) => {
      cena.render = null;
      loja.gravavel = true;
      return trabalho();
    },
    renderizar: async (trabalho) => {
      cena.render = new Map();
      loja.gravavel = false;
      try {
        return await trabalho();
      } finally {
        cena.render = null;
      }
    },
  };
  try {
    const valor = await noServidor(fases);
    return { ...contagem(), parouNoMiddleware: null, valor };
  } finally {
    navegador.receber(loja.gravados);
    cena.pedido = null;
    cena.render = null;
  }
}

/** Para onde a porta mandou (redirect) ou o que ela devolveu. */
async function destinoOuValor<T>(trabalho: () => Promise<T>): Promise<T | string> {
  try {
    return await trabalho();
  } catch (erro: unknown) {
    if (erro instanceof Error && erro.message.startsWith("REDIRECT ")) return erro.message;
    throw erro;
  }
}

// O que cada tipo de requisição chama, na ordem em que o Next chama.

/** src/app/(time)/layout.tsx + generateMetadata + page.tsx de uma tela do time. */
async function telaDoTime() {
  const ator = await exigirAtor();
  const sessao = await identidadeDaSessao();
  if (sessao) await staffDaIdentidade(sessao.identidade);
  await exigirAtor();
  await exigirAtor();
  await permissoesDoAtor("escala.montar", "escala.aprovar");
  return ator.email;
}

/** src/app/sdc/layout.tsx + page.tsx. */
async function telaDaSdc() {
  const sdc = await exigirAtorSdc();
  await exigirAtorSdc();
  return sdc.email;
}

/** /meu-cadastro, /responder/[enqueteId] e /solicitar-custo: identidadeDaSessao() + staffDaIdentidade(). */
async function telaDoStaff() {
  const sessao = await identidadeDaSessao();
  if (!sessao) return "REDIRECT /login";
  return (await staffDaIdentidade(sessao.identidade)) ? "staff" : "não é staff";
}

const formulario = () => {
  const dados = new FormData();
  dados.set("campo", "valor");
  return dados;
};
const schema = z.object({ campo: z.string() });

const DO_TIME: Usuario = { id: "a0000000-0000-4000-8000-000000000001", email: "time@exemplo.test" };
const DA_SDC: Usuario = { id: "a0000000-0000-4000-8000-000000000002", email: "atendimento.sdc@exemplo.test" };
const DO_STAFF: Usuario = { id: "a0000000-0000-4000-8000-000000000003", email: "staff@exemplo.test" };

beforeEach(() => {
  cena.cadastro = new Map([
    [DO_TIME.email, "TIME"],
    [DA_SDC.email, "SDC"],
    [DO_STAFF.email, "STAFF"],
  ]);
  cena.leiturasDoBanco = 0;
  cena.pedido = null;
  cena.render = null;
  supabase.sessoes.clear();
  supabase.renovacoes.clear();
  supabase.chavesNoAr = true;
});

describe.each<[string, Chave]>([
  ["chave simétrica (HS256: o getClaims() da biblioteca pergunta ao Auth)", "HS256"],
  ["chave assimétrica (ES256: o getClaims() confere a assinatura aqui, com a chave pública)", "ES256"],
])("uma ida ao Supabase Auth por requisição — projeto com %s", (_nome, chave) => {
  const UMA_IDA = { usuario: 1, renovacao: 0, chaves: 0 };
  const antes = ANTES_DA_MUDANCA[chave];

  /** A chave pública é buscada uma vez e fica em memória (10 minutos); não entra na conta por requisição. */
  async function comAChavePublicaEmMemoria() {
    const outroNavegador = await entrar(DA_SDC, chave);
    await requisicao(outroNavegador, "/aquecimento", ({ renderizar }) => renderizar(() => destinoOuValor(telaDaSdc)));
  }

  it(`página do time: 1 (antes ${antes.paginaDoTime})`, async () => {
    const navegador = await entrar(DO_TIME, chave);
    await comAChavePublicaEmMemoria();

    const resposta = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
    expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: DO_TIME.email, idas: UMA_IDA });
  });

  it(`server action do time, com a tela que ela redesenha: 1 (antes ${antes.actionDoTime})`, async () => {
    const navegador = await entrar(DO_TIME, chave);
    await comAChavePublicaEmMemoria();

    const resposta = await requisicao(navegador, "/eventos/1/escala", async ({ action, renderizar }) => {
      const resultado = await action(() => executarAcao(formulario(), schema, "escala.montar", async (_dados, ator) => `feito por ${ator.email}`));
      return { resultado, tela: await renderizar(telaDoTime) };
    });
    expect(resposta).toMatchObject({ valor: { resultado: { ok: true, mensagem: `feito por ${DO_TIME.email}` }, tela: DO_TIME.email }, idas: UMA_IDA });
    // O banco continua decidindo nas duas fases: a action e a tela leem o acesso de novo, cada uma por si.
    expect(resposta.leiturasDoBanco).toBeGreaterThanOrEqual(2);
  });

  it(`página da SDC: 1 (antes ${antes.paginaDaSdc})`, async () => {
    const navegador = await entrar(DA_SDC, chave);
    await comAChavePublicaEmMemoria();

    const resposta = await requisicao(navegador, "/sdc/voos", ({ renderizar }) => renderizar(telaDaSdc));
    expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: DA_SDC.email, idas: UMA_IDA });
  });

  it(`server action da SDC, com a tela que ela redesenha: 1 (antes ${antes.actionDaSdc})`, async () => {
    const navegador = await entrar(DA_SDC, chave);
    await comAChavePublicaEmMemoria();

    const resposta = await requisicao(navegador, "/sdc/voos", async ({ action, renderizar }) => {
      const resultado = await action(() => executarAcaoDaSdc(formulario(), schema, async (_dados, sdc) => `feito por ${sdc.email}`));
      return { resultado, tela: await renderizar(telaDaSdc) };
    });
    expect(resposta).toMatchObject({ valor: { resultado: { ok: true, mensagem: `feito por ${DA_SDC.email}` }, tela: DA_SDC.email }, idas: UMA_IDA });
  });

  it(`página do staff (/meu-cadastro, /responder, /solicitar-custo): 1 (antes ${antes.paginaDoStaff})`, async () => {
    const navegador = await entrar(DO_STAFF, chave);
    await comAChavePublicaEmMemoria();

    const resposta = await requisicao(navegador, "/meu-cadastro", ({ renderizar }) => renderizar(telaDoStaff));
    expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: "staff", idas: UMA_IDA });
  });

  it(`server action do staff, com a tela que ela redesenha: 1 (antes ${antes.actionDoStaff}); rota de comprovante: 1 (antes ${antes.rotaDoStaff})`, async () => {
    const navegador = await entrar(DO_STAFF, chave);
    await comAChavePublicaEmMemoria();

    const comTela = await requisicao(navegador, "/solicitar-custo/1", async ({ action, renderizar }) => ({ sessao: await action(staffDaSessao), tela: await renderizar(telaDoStaff) }));
    expect(comTela).toMatchObject({ valor: { sessao: { ok: true, ator: { pessoaId: "pessoa-do-staff", origem: "SESSAO" } }, tela: "staff" }, idas: UMA_IDA });

    const rota = await requisicao(navegador, "/solicitar-custo/1/comprovantes", ({ action }) => action(staffDaSessao));
    expect(rota).toMatchObject({ valor: { ok: true }, idas: UMA_IDA });
  });

  it("o middleware não pergunta nada ao Auth quando o token ainda vale", async () => {
    const navegador = await entrar(DO_TIME, chave);
    await comAChavePublicaEmMemoria();

    const resposta = await requisicao(navegador, "/calendario", async () => "o servidor não fez nada");
    expect(resposta).toMatchObject({ parouNoMiddleware: null, idas: { usuario: 0, renovacao: 0, chaves: 0 } });
  });

  it("sem cookie de sessão: o middleware manda para o login sem nenhuma chamada de rede", async () => {
    const resposta = await requisicao(novoNavegador(), "/calendario?mes=11", async () => "não chega aqui");
    expect(resposta).toMatchObject({ parouNoMiddleware: "/login", idas: { usuario: 0, renovacao: 0, chaves: 0 } });
  });

  describe("o que não pode mudar", () => {
    it("cada requisição pergunta de novo: a resposta do Auth não passa de uma requisição para outra", async () => {
      const navegador = await entrar(DO_TIME, chave);
      await comAChavePublicaEmMemoria();

      const primeira = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
      const segunda = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
      expect([primeira.idas.usuario, segunda.idas.usuario]).toEqual([1, 1]);
    });

    it("sessão encerrada no Supabase (saiu em outro lugar, usuário removido) cai na requisição seguinte, com o token ainda dentro da validade", async () => {
      const navegador = await entrar(DO_TIME, chave);
      await comAChavePublicaEmMemoria();
      expect((await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime))).parouNoMiddleware).toBeNull();

      supabase.sessoes.clear();

      const tela = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(() => destinoOuValor(telaDoTime)));
      expect(tela).toMatchObject({ parouNoMiddleware: null, valor: "REDIRECT /login", leiturasDoBanco: 0 });
      const acao = await requisicao(navegador, "/calendario", ({ action }) => action(() => executarAcao(formulario(), schema, "escala.montar", async () => "não roda")));
      expect(acao).toMatchObject({ valor: { ok: false, erro: "Sua sessão terminou. Entre de novo para continuar." } });
    });

    it("tirar o perfil corta no próximo clique, e também entre a action e a tela da mesma requisição", async () => {
      const navegador = await entrar(DO_TIME, chave);
      await comAChavePublicaEmMemoria();

      const mesmaRequisicao = await requisicao(navegador, "/configuracoes/acesso", async ({ action, renderizar }) => {
        const resultado = await action(() =>
          executarAcao(formulario(), schema, "escala.montar", async () => {
            cena.cadastro.set(DO_TIME.email, "SEM_PERFIL");
            return "perfil retirado durante a action";
          }),
        );
        return { resultado, tela: await renderizar(() => destinoOuValor(telaDoTime)) };
      });
      expect(mesmaRequisicao).toMatchObject({ valor: { resultado: { ok: true }, tela: "REDIRECT /sem-acesso" }, idas: UMA_IDA });

      const seguinte = await requisicao(navegador, "/calendario", ({ action }) => action(() => executarAcao(formulario(), schema, "escala.montar", async () => "não roda")));
      expect(seguinte).toMatchObject({ valor: { ok: false }, idas: UMA_IDA });
    });

    it("desativar o e-mail da SDC corta no próximo clique", async () => {
      const navegador = await entrar(DA_SDC, chave);
      await comAChavePublicaEmMemoria();
      cena.cadastro.delete(DA_SDC.email);

      const resposta = await requisicao(navegador, "/sdc", ({ renderizar }) => renderizar(() => destinoOuValor(telaDaSdc)));
      expect(resposta).toMatchObject({ valor: "REDIRECT /auth/encerrar?motivo=sem-cadastro", idas: UMA_IDA });
    });

    it("e-mail não confirmado pelo provedor não identifica ninguém (nem chega ao banco)", async () => {
      const navegador = await entrar({ ...DO_TIME, confirmado: false }, chave);
      await comAChavePublicaEmMemoria();

      const time = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(() => destinoOuValor(telaDoTime)));
      expect(time).toMatchObject({ valor: "REDIRECT /auth/encerrar?motivo=sem-cadastro", leiturasDoBanco: 0, idas: UMA_IDA });
      const staff = await requisicao(navegador, "/meu-cadastro", ({ renderizar }) => renderizar(telaDoStaff));
      expect(staff).toMatchObject({ valor: "REDIRECT /login", leiturasDoBanco: 0, idas: UMA_IDA });
    });

    it.each(["password", "otp", "magiclink"])("SDC: sessão que entrou por %s não é ator SDC (a regra do Google falha fechada, com uma ida só)", async (metodo) => {
      const navegador = await entrar(DA_SDC, chave, { metodo });
      await comAChavePublicaEmMemoria();

      const resposta = await requisicao(navegador, "/sdc", ({ renderizar }) => renderizar(() => destinoOuValor(telaDaSdc)));
      expect(resposta).toMatchObject({ valor: "REDIRECT /auth/encerrar?motivo=sem-cadastro", idas: UMA_IDA });
    });

    it("SDC: conta criada por e-mail e senha com o e-mail da lista não é ator SDC", async () => {
      const navegador = await entrar({ ...DA_SDC, provedor: "email" }, chave);
      await comAChavePublicaEmMemoria();

      const resposta = await requisicao(navegador, "/sdc", ({ renderizar }) => renderizar(() => destinoOuValor(telaDaSdc)));
      expect(resposta).toMatchObject({ valor: "REDIRECT /auth/encerrar?motivo=sem-cadastro", idas: UMA_IDA });
    });

    it("token para vencer: o middleware renova uma vez, grava os cookies novos e o servidor confere o token NOVO", async () => {
      const navegador = await entrar(DO_TIME, chave, { validadeEmSegundos: 30 });
      await comAChavePublicaEmMemoria();
      const tokenVelho = navegador.tokenDeAcesso();
      navegador.recebidos.length = 0;

      const resposta = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
      expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: DO_TIME.email, idas: { usuario: 1, renovacao: 1, chaves: 0 } });
      expect(navegador.tokenDeAcesso()).not.toBe(tokenVelho);
      expect(supabase.sessoes.has(navegador.tokenDeAcesso()!)).toBe(true);
      expect(supabase.ultimoConferido).toBe(navegador.tokenDeAcesso());
      // Os cookies renovados saem com o reforço do app (httpOnly, lax, raiz do site) e a resposta não fica em cache de proxy.
      expect(navegador.recebidos.length).toBeGreaterThan(0);
      for (const cookie of navegador.recebidos) expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
      expect(resposta.cacheDoMiddleware).toContain("no-store");

      // Na requisição seguinte o token novo já vale: nada de renovar outra vez.
      const seguinte = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
      expect(seguinte).toMatchObject({ valor: DO_TIME.email, idas: UMA_IDA, cacheDoMiddleware: null });
    });

    it("token vencido cuja renovação o Supabase recusa: volta para o login", async () => {
      const navegador = await entrar(DO_TIME, chave, { validadeEmSegundos: 1 });
      supabase.renovacoes.clear();
      await new Promise((feito) => setTimeout(feito, 1100));

      const resposta = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(() => destinoOuValor(telaDoTime)));
      expect(resposta).toMatchObject({ parouNoMiddleware: "/login", idas: { usuario: 0, renovacao: 1 } });
    });

    it("token que o Supabase não emitiu nunca entra: o servidor recusa (e, com chave assimétrica, o middleware já barra)", async () => {
      const navegador = await entrar(DO_TIME, chave);
      await comAChavePublicaEmMemoria();
      // Troca o token do cookie por um forjado: mesmo conteúdo, assinatura inventada.
      const [cabecalho, corpo] = navegador.tokenDeAcesso()!.split(".");
      const forjado = `${cabecalho}.${corpo}.${base64url(randomBytes(chave === "HS256" ? 32 : 64))}`;
      navegador.trocarTokenDeAcesso(forjado);
      expect(navegador.tokenDeAcesso()).toBe(forjado);

      const resposta = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(() => destinoOuValor(telaDoTime)));
      if (chave === "HS256") expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: "REDIRECT /login", leiturasDoBanco: 0, idas: { usuario: 1 } });
      else expect(resposta).toMatchObject({ parouNoMiddleware: "/login", idas: { usuario: 0, renovacao: 0, chaves: 0 } });
    });
  });
});

describe("chave assimétrica: a chave pública do projeto", () => {
  it("fora do ar no middleware: ele deixa passar e quem decide é o servidor, que pergunta ao Auth", async () => {
    const navegador = await entrar(DO_TIME, "ES256");
    // Um token que o Auth aceita, assinado com uma chave (`kid`) que não está em memória: a biblioteca tem de buscar
    // as chaves públicas, e o endereço delas está fora do ar.
    const [cabecalho, corpo, assinatura] = navegador.tokenDeAcesso()!.split(".");
    const comOutroKid = `${base64url(JSON.stringify({ ...(JSON.parse(Buffer.from(cabecalho!, "base64url").toString("utf8")) as object), kid: "chave-que-nao-esta-em-memoria" }))}.${corpo}.${assinatura}`;
    supabase.sessoes.set(comOutroKid, DO_TIME);
    navegador.trocarTokenDeAcesso(comOutroKid);
    supabase.chavesNoAr = false;

    const resposta = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
    expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: DO_TIME.email, idas: { usuario: 1, renovacao: 0, chaves: 1 } });
  });

  it("token assinado com uma chave que o projeto não publica: a biblioteca pergunta ao Auth no middleware (exceção conhecida: 2 idas)", async () => {
    const navegador = await entrar(DO_TIME, "ES256");
    const [cabecalho, corpo, assinatura] = navegador.tokenDeAcesso()!.split(".");
    const comOutroKid = `${base64url(JSON.stringify({ ...(JSON.parse(Buffer.from(cabecalho!, "base64url").toString("utf8")) as object), kid: "chave-que-o-projeto-nao-publica" }))}.${corpo}.${assinatura}`;
    supabase.sessoes.set(comOutroKid, DO_TIME);
    navegador.trocarTokenDeAcesso(comOutroKid);

    // Só acontece com chave retirada do projeto, e aí o Auth de verdade recusa o token; aqui ele aceita para contar.
    const resposta = await requisicao(navegador, "/calendario", ({ renderizar }) => renderizar(telaDoTime));
    expect(resposta).toMatchObject({ parouNoMiddleware: null, valor: DO_TIME.email, idas: { usuario: 2, renovacao: 0, chaves: 1 } });
  });
});

describe("buscaDaRequisicao: a memória de uma requisição", () => {
  const USUARIO = `${SUPABASE}/auth/v1/user`;
  const comToken = (token: string): RequestInit => ({ method: "GET", headers: { Authorization: `Bearer ${token}`, apikey: "chave-publica-de-teste" } });

  it("o mesmo token na mesma requisição vai uma vez; cada leitora recebe a própria cópia da resposta", async () => {
    const { access_token } = supabase.emitir(DO_TIME, "HS256");
    const buscar = buscaDaRequisicao({}, SUPABASE);
    const antes = supabase.idas.usuario;
    const [primeira, segunda] = await Promise.all([buscar(USUARIO, comToken(access_token)), buscar(USUARIO, comToken(access_token))]);
    expect(supabase.idas.usuario - antes).toBe(1);
    expect(primeira).not.toBe(segunda);
    expect(await primeira.json()).toMatchObject({ email: DO_TIME.email });
    expect(await segunda.json()).toMatchObject({ email: DO_TIME.email });
  });

  it("outra requisição, outro token ou outro cliente da mesma requisição com outro token: pergunta de novo", async () => {
    const um = supabase.emitir(DO_TIME, "HS256").access_token;
    const outro = supabase.emitir(DA_SDC, "HS256").access_token;
    const requisicaoA = {};
    const antes = supabase.idas.usuario;
    await buscaDaRequisicao(requisicaoA, SUPABASE)(USUARIO, comToken(um));
    await buscaDaRequisicao(requisicaoA, SUPABASE)(USUARIO, comToken(um));
    expect(supabase.idas.usuario - antes).toBe(1);
    expect(await (await buscaDaRequisicao(requisicaoA, SUPABASE)(USUARIO, comToken(outro))).json()).toMatchObject({ email: DA_SDC.email });
    expect(supabase.idas.usuario - antes).toBe(2);
    await buscaDaRequisicao({}, SUPABASE)(USUARIO, comToken(um));
    expect(supabase.idas.usuario - antes).toBe(3);
  });

  it("a recusa do Auth também vale para o resto da requisição (não vira aceite na segunda leitura)", async () => {
    const buscar = buscaDaRequisicao({}, SUPABASE);
    const respostas = [await buscar(USUARIO, comToken("token-desconhecido")), await buscar(USUARIO, comToken("token-desconhecido"))];
    expect(respostas.map((resposta) => resposta.status)).toEqual([403, 403]);
  });

  it("só o GET /user é lembrado: renovar o token e qualquer outro pedido vão sempre pela rede", async () => {
    const buscar = buscaDaRequisicao({}, SUPABASE);
    const { refresh_token } = supabase.emitir(DO_TIME, "HS256");
    const renovar = () => buscar(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { Authorization: "Bearer chave-publica-de-teste" }, body: JSON.stringify({ refresh_token }) });
    const antes = supabase.idas.renovacao;
    expect((await renovar()).status).toBe(200);
    expect((await renovar()).status).toBe(400);
    expect(supabase.idas.renovacao - antes).toBe(2);
  });

  it("falha de rede não fica guardada: a leitura seguinte tenta de novo", async () => {
    const original = supabase.responder;
    let falhas = 0;
    supabase.responder = async () => {
      falhas += 1;
      throw new Error("rede fora");
    };
    const { access_token } = supabase.emitir(DO_TIME, "HS256");
    const buscar = buscaDaRequisicao({}, SUPABASE);
    try {
      await expect(buscar(USUARIO, comToken(access_token))).rejects.toThrow("rede fora");
    } finally {
      supabase.responder = original;
    }
    expect(falhas).toBe(1);
    expect((await buscar(USUARIO, comToken(access_token))).status).toBe(200);
  });
});

describe("só dois lugares falam com o Supabase Auth sobre a sessão", () => {
  const RAIZ = path.resolve(import.meta.dirname, "../..");
  const CHAMADA = /\.auth\s*\.\s*(getUser|getClaims|getSession)\s*\(/g;
  const chamadasPorArquivo = new Map<string, string[]>();
  for (const arquivo of globSync("**/*.{ts,tsx}", { cwd: RAIZ }).filter((caminho) => !caminho.includes("__tests__"))) {
    const chamadas = [...readFileSync(path.join(RAIZ, arquivo), "utf8").matchAll(CHAMADA)].map((achado) => achado[1]!);
    if (chamadas.length > 0) chamadasPorArquivo.set(arquivo.split(path.sep).join("/"), chamadas);
  }

  it("o middleware (só renova e confere a assinatura sem rede) e usuario-atual.ts (uma conferência no Auth por requisição)", () => {
    expect(Object.fromEntries(chamadasPorArquivo)).toEqual({
      "middleware.ts": ["getSession", "getClaims"],
      "app/(time)/_servidor/usuario-atual.ts": ["getUser", "getClaims"],
    });
  });

  it("existe o que a varredura procura (a expressão não ficou velha)", () => {
    expect(readFileSync(path.join(RAIZ, "middleware.ts"), "utf8")).toContain("supabase.auth.");
    expect(situacaoDoAtor).toBeTypeOf("function");
  });
});

describe("nada atrás do middleware depende dele para conferir a sessão", () => {
  // O middleware deixou de perguntar ao Supabase Auth (com segredo simétrico ele só vê que existe um cookie). Por isso
  // toda entrada do app (página, layout, rota e arquivo de server actions) precisa passar por uma porta do servidor,
  // que confere a sessão no Auth e decide pelo banco. As exceções são as entradas que não têm sessão para conferir.
  const APP = path.resolve(import.meta.dirname, "..");
  const PORTA = /\b(exigirAtor|exigirAtorSdc|situacaoDoAtor|identidadeDaSessao|staffDaSessao|executarAcao|executarLeitura|executarAcaoDaSdc|permissoesDoAtor)\(/;
  const SEM_SESSAO_PARA_CONFERIR: Record<string, string> = {
    "layout.tsx": "moldura do site (html e body), sem dado",
    "page.tsx": "só redireciona para /inicio",
    "login/acoes.ts": "é a entrada: abre o Google ou confere a senha no IAM Control",
    "auth/callback/route.ts": "volta do Google: troca o código pela sessão",
    "auth/sair/route.ts": "encerra a sessão (POST do próprio site)",
    "(time)/_servidor/sessao.ts": "botão Sair",
    "entrar-local/acoes.ts": "só no modo local, atrás das três travas do banco local (entradaLocalLiberada)",
    "api/health/route.ts": "saúde do serviço, fora do middleware",
    "api/versao/route.ts": "versão publicada, fora do middleware",
  };

  const entradas = globSync("**/*.{ts,tsx}", { cwd: APP })
    .map((arquivo) => arquivo.split(path.sep).join("/"))
    .filter((arquivo) => !arquivo.includes("__tests__"))
    .filter((arquivo) => /(^|\/)(page|layout)\.tsx$|(^|\/)route\.ts$/.test(arquivo) || /^"use server";/m.test(readFileSync(path.join(APP, arquivo), "utf8")))
    .sort();
  const semPorta = entradas.filter((arquivo) => !PORTA.test(readFileSync(path.join(APP, arquivo), "utf8")));

  it("encontra as entradas do app", () => {
    expect(entradas.length).toBeGreaterThanOrEqual(60);
    expect(entradas).toEqual(expect.arrayContaining(["(time)/layout.tsx", "sdc/acoes.ts", "meu-cadastro/page.tsx", "solicitar-custo/[eventoId]/comprovantes/route.ts", "(time)/custos/comprovantes/[comprovanteId]/route.ts"]));
  });

  it("só as entradas sem sessão para conferir ficam sem porta (lista fechada)", () => {
    expect(semPorta).toEqual(Object.keys(SEM_SESSAO_PARA_CONFERIR).sort());
  });
});
