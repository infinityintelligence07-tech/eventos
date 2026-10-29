import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { sair } from "@/app/(time)/_servidor/sessao";
import { situacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";

import { MolduraDeEntrada } from "../login/_componentes/moldura";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sem acesso" };

/** Logado, sem perfil do Eventos (docs/09 L5). Fora do (time): sem menu e sem nenhum dado do Eventos. */
export default async function PaginaSemAcesso() {
  const atual = await situacaoDoAtor();
  switch (atual.situacao) {
    case "OK":
      redirect("/inicio");
    case "SEM_SESSAO":
      redirect(atual.destino);
    case "SEM_CADASTRO":
      redirect("/auth/encerrar?motivo=sem-cadastro");
    case "SEM_PERFIL":
      break;
    default: {
      const desconhecida: never = atual;
      throw new Error(`situação do ator desconhecida: ${JSON.stringify(desconhecida)}`);
    }
  }

  return (
    <MolduraDeEntrada>
      <h1>Sem acesso ao Eventos</h1>
      <p className="login-lead">
        Sua conta ({atual.email}) não tem acesso ao Eventos. Peça à líder do time para liberar o seu perfil.
      </p>
      <form action={sair}>
        <button type="submit" className="login-submit">
          Sair
        </button>
      </form>
    </MolduraDeEntrada>
  );
}
