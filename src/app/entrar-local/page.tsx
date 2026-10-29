import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { entradaLocalLiberada, situacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { listarUsuariosLocais, rotuloDoPerfil, type UsuarioLocal } from "@/core/auth";
import { bancoParaLeitura } from "@/fluxos/_base";

import { MolduraDeEntrada } from "../login/_componentes/moldura";
import { entrarComo } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar como" };

function OpcaoDeUsuario({ usuario, atual }: { usuario: UsuarioLocal; atual: boolean }) {
  const perfis = usuario.perfis.map(rotuloDoPerfil).join(" · ");
  return (
    <form action={entrarComo}>
      <input type="hidden" name="usuarioId" value={usuario.usuarioId} />
      <button type="submit" className="login-app" aria-current={atual ? "true" : undefined}>
        <strong>{usuario.nome}</strong>
        <small>
          {usuario.email}
          {perfis ? ` · ${perfis}` : ""}
        </small>
        <span className="login-app-cta">{atual ? "Você está como esta pessoa · entrar de novo" : "Entrar como esta pessoa"}</span>
      </button>
    </form>
  );
}

/** Seletor do modo local (docs/09 L6). Não existe fora do modo local nem com alguma trava do banco local fechada. */
export default async function PaginaEntrarLocal({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!(await entradaLocalLiberada())) notFound();
  const [{ erro }, usuarios, atual] = await Promise.all([searchParams, bancoParaLeitura().then(listarUsuariosLocais), situacaoDoAtor()]);
  const atualId = atual.situacao === "OK" ? atual.ator.usuarioId : null;
  const comPerfil = usuarios.filter((usuario) => usuario.perfis.length > 0);
  const semPerfil = usuarios.filter((usuario) => usuario.perfis.length === 0);

  return (
    <MolduraDeEntrada>
      <h1>Entrar como</h1>
      <p className="login-lead">Versão local, sem Google: escolha um usuário de teste do banco local.</p>
      {erro && (
        <p className="login-error" role="alert">
          Esse usuário não está ativo no banco local. Escolha outro.
        </p>
      )}
      {comPerfil.length === 0 && (
        <p className="login-error" role="alert">
          Nenhum usuário com perfil do Eventos no banco local. Rode <code>npm run banco:local</code> de novo.
        </p>
      )}
      <div className="login-apps">
        {comPerfil.map((usuario) => (
          <OpcaoDeUsuario key={usuario.usuarioId} usuario={usuario} atual={usuario.usuarioId === atualId} />
        ))}
      </div>
      {semPerfil.length > 0 && (
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-[13px] text-white/60">Sem perfil do Eventos ({semPerfil.length}) · para testar a tela Sem acesso</summary>
          <div className="login-apps mt-2">
            {semPerfil.map((usuario) => (
              <OpcaoDeUsuario key={usuario.usuarioId} usuario={usuario} atual={false} />
            ))}
          </div>
        </details>
      )}
      <p className="login-terms">Mesmos perfis e regras do login real. Só aparece com as três travas do banco local abertas.</p>
    </MolduraDeEntrada>
  );
}
