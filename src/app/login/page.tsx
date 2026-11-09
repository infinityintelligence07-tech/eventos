import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { entradaLocalLiberada, situacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { modoDemo, modoLocal } from "@/core/ambiente";
import { configuracaoDoLogin, destinoSeguro, segredoDaSessao } from "@/core/auth";
import { lerConfig } from "@/core/config/leitura";

import { MolduraDeEntrada } from "./_componentes/moldura";
import { entrarComGoogle, entrarComSenha } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

// Mensagem por código, nunca o texto do provedor (docs/09 §2.2).
const MENSAGENS: Record<string, string> = {
  "sem-cadastro": "Sua conta Google não está cadastrada na IAM. Peça ao RH para conferir o seu e-mail no cadastro de pessoas.",
  "link-expirado": "O link de entrada expirou ou já foi usado. Tente de novo.",
  falhou: "Não foi possível entrar. Tente de novo.",
  "nao-configurado": "O login não está configurado neste ambiente.",
  credenciais: "E-mail ou senha incorretos, ou conta ainda não aprovada no IAM Control.",
  "muitas-tentativas": "Muitas tentativas. Espere 15 minutos e tente de novo.",
  "iam-control-fora": "Não foi possível falar com o IAM Control agora. Tente de novo em instantes ou entre com o Google.",
};

/** Login com a mesma conta do IAM Control (docs/10): precisa do endereço dele e do segredo da sessão. */
function loginComSenhaConfigurado(): boolean {
  try {
    return Boolean(segredoDaSessao() && lerConfig().IAM_CONTROL_URL);
  } catch {
    return false;
  }
}

function IconeDoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ erro?: string; proximo?: string }> }) {
  const { erro, proximo } = await searchParams;
  if (modoDemo()) redirect("/inicio");

  if (modoLocal()) {
    if (await entradaLocalLiberada()) redirect("/entrar-local");
    return (
      <MolduraDeEntrada>
        <h1>Versão local</h1>
        <p className="login-error" role="alert">
          O banco local não está pronto (alguma trava da escrita está fechada). Rode <code>npm run banco:local</code> e
          depois <code>npm run dev:local</code>.
        </p>
      </MolduraDeEntrada>
    );
  }

  if ((await situacaoDoAtor()).situacao === "OK") redirect(destinoSeguro(proximo));

  const googleConfigurado = Boolean(configuracaoDoLogin()?.urlPublica);
  const senhaConfigurada = loginComSenhaConfigurado();
  const mensagem = (erro && MENSAGENS[erro]) || (!googleConfigurado && !senhaConfigurada ? MENSAGENS["nao-configurado"] : null);
  const destino = destinoSeguro(proximo);
  const urlDoIamControl = lerConfig().IAM_CONTROL_URL;

  return (
    <MolduraDeEntrada>
      <h1>Entrar</h1>
      <p className="login-lead">Use a mesma conta do IAM Control: e-mail e senha, ou o Google.</p>
      {mensagem && (
        <p className="login-error" role="alert">
          {mensagem}
        </p>
      )}
      {senhaConfigurada && (
        <form action={entrarComSenha} className="login-senha">
          <input type="hidden" name="proximo" value={destino} />
          <label className="login-campo">
            <span>E-mail</span>
            <input type="email" name="email" autoComplete="username" required maxLength={254} />
          </label>
          <label className="login-campo">
            <span>Senha</span>
            <input type="password" name="senha" autoComplete="current-password" required maxLength={256} />
          </label>
          <button type="submit" className="login-submit">
            Entrar
          </button>
          {urlDoIamControl && (
            <a className="login-esqueci" href={new URL("/signin", urlDoIamControl).toString()} target="_blank" rel="noopener noreferrer">
              Esqueci minha senha (recuperar no IAM Control)
            </a>
          )}
        </form>
      )}
      {senhaConfigurada && googleConfigurado && <p className="login-ou">ou</p>}
      {(googleConfigurado || !senhaConfigurada) && (
        <form action={entrarComGoogle}>
          <input type="hidden" name="proximo" value={destino} />
          <button type="submit" className="google-login-button" disabled={!googleConfigurado}>
            <IconeDoGoogle />
            Continuar com Google
          </button>
        </form>
      )}
      <p className="login-terms">Só entra quem tem conta ativa no IAM Control e perfil do Eventos.</p>
    </MolduraDeEntrada>
  );
}
