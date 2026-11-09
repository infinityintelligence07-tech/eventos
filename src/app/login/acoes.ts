"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  assinarSessao,
  configuracaoDoLogin,
  COOKIE_SESSAO,
  criarLimiteDeTentativas,
  criarSupabaseDoServidor,
  destinoSeguro,
  DURACAO_DA_SESSAO_EM_SEGUNDOS,
  opcoesDoCookie,
  segredoDaSessao,
} from "@/core/auth";
import { lerConfig } from "@/core/config/leitura";
// Direto do cliente: o index lê toda a configuração ao carregar, e a página de login é coletada no build.
import { conferirSenhaNoIamControl } from "@/core/integrations/iam-control/client";
import { logger } from "@/core/logging";

// Login com e-mail e senha do IAM Control (docs/10): 5 falhas por e-mail e 20 por IP a cada 15 minutos.
const QUINZE_MINUTOS = 15 * 60 * 1000;
const tentativasPorEmail = criarLimiteDeTentativas(5, QUINZE_MINUTOS);
const tentativasPorIp = criarLimiteDeTentativas(20, QUINZE_MINUTOS);

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

/** IP de quem pede: o Cloudflare manda o original em cf-connecting-ip; sem ele, o primeiro do x-forwarded-for. */
async function ipDoPedido(): Promise<string> {
  const lista = await headers();
  return lista.get("cf-connecting-ip")?.trim() || lista.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}

const campo = (form: FormData, nome: string) => (typeof form.get(nome) === "string" ? (form.get(nome) as string) : "");

/** "Entrar" com e-mail e senha: o IAM Control confere; o Eventos guarda só o e-mail num cookie assinado. */
export async function entrarComSenha(form: FormData): Promise<void> {
  const proximo = destinoSeguro(campo(form, "proximo") || null);
  const voltar = (erro: string) => redirect(`/login?erro=${erro}&proximo=${encodeURIComponent(proximo)}`);

  const segredo = segredoDaSessao();
  const config = lerConfig();
  if (!segredo || !config.IAM_CONTROL_URL) voltar("nao-configurado");

  const email = campo(form, "email").trim().toLowerCase();
  const senha = campo(form, "senha");
  if (!email || !senha || email.length > 254 || senha.length > 256) voltar("credenciais");

  const agora = new Date();
  const ip = await ipDoPedido();
  if (tentativasPorEmail.bloqueado(email, agora) || tentativasPorIp.bloqueado(ip, agora)) voltar("muitas-tentativas");

  let resultado: Awaited<ReturnType<typeof conferirSenhaNoIamControl>>;
  try {
    resultado = await conferirSenhaNoIamControl({ baseUrl: config.IAM_CONTROL_URL! }, email, senha);
  } catch (cause: unknown) {
    // Sem e-mail nem senha no log.
    logger.error({ componente: "login-senha", erro: cause instanceof Error ? cause.message : String(cause) }, "IAM Control indisponível no login");
    return voltar("iam-control-fora");
  }
  if (!resultado.ok) {
    tentativasPorEmail.registrarFalha(email, agora);
    tentativasPorIp.registrarFalha(ip, agora);
    return voltar("credenciais");
  }

  tentativasPorEmail.limpar(email);
  (await cookies()).set(COOKIE_SESSAO, assinarSessao(resultado.email, segredo!, agora), {
    ...opcoesDoCookie(config.NODE_ENV === "production"),
    maxAge: DURACAO_DA_SESSAO_EM_SEGUNDOS,
  });
  // O layout decide o acesso (core.usuario ativo + perfil do Eventos), como no Google.
  redirect(proximo);
}
