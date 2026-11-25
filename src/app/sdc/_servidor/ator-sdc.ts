import { redirect } from "next/navigation";

import { situacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import type { AtorSdc } from "@/core/auth";

// Quem pode estar na área da SDC (docs/09 §15): só um ator SDC, isto é, alguém ativo em eventos.acesso_sdc que não é do
// time. Resolvido do banco a cada requisição pela mesma decisão que o time usa (situacaoDoAtor). O time não entra aqui
// e a SDC não entra nas telas do time: são tipos e portas separados.

/** Nulo = não é SDC (sem sessão, do time, sem acesso ou visitante da demo). */
export async function obterAtorSdc(): Promise<AtorSdc | null> {
  const atual = await situacaoDoAtor();
  return atual.situacao === "SDC" ? atual.sdc : null;
}

/** Primeira instrução de toda página e layout de /sdc. Quem não é SDC é levado para o lugar dele; nada é lido antes. */
export async function exigirAtorSdc(): Promise<AtorSdc> {
  const atual = await situacaoDoAtor();
  switch (atual.situacao) {
    case "SDC":
      return atual.sdc;
    case "OK":
      // Alguém do time: a área da SDC não é dele (o time acompanha os mesmos pedidos em Voos e Hospedagem).
      redirect("/inicio");
    case "SEM_SESSAO":
      redirect(atual.destino);
    case "SEM_CADASTRO":
      redirect("/auth/encerrar?motivo=sem-cadastro");
    case "SEM_PERFIL":
      redirect("/sem-acesso");
    default: {
      const desconhecida: never = atual;
      throw new Error(`situação do ator desconhecida: ${JSON.stringify(desconhecida)}`);
    }
  }
}
