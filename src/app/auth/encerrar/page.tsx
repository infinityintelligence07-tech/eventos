import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { situacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";

import { MolduraDeEntrada } from "../../login/_componentes/moldura";
import { FormularioDeSaida } from "./_componentes/formulario-de-saida";
import { decisaoDaSaida } from "./decisao";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saindo" };

/** O layout não apaga cookie: quem tem sessão sem cadastro ativo vem para cá e o formulário encerra a sessão por POST. */
export default async function PaginaEncerrar() {
  const decisao = decisaoDaSaida(await situacaoDoAtor());
  if (decisao.tipo === "IR") redirect(decisao.destino);

  return (
    <MolduraDeEntrada>
      <h1>Encerrando a sessão</h1>
      <p className="login-lead">Sua conta Google não está cadastrada na IAM. Você vai voltar para a tela de entrada.</p>
      <FormularioDeSaida motivo="sem-cadastro" />
    </MolduraDeEntrada>
  );
}
