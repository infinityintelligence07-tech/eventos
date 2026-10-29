import type { SituacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";

export type DecisaoDaSaida = { tipo: "ENCERRAR" } | { tipo: "IR"; destino: string };

/**
 * Só quem tem sessão sem cadastro ativo vê o formulário que encerra a sessão sozinho. Os outros são levados embora,
 * para um link de outro site para /auth/encerrar não deslogar quem tem acesso.
 */
export function decisaoDaSaida(atual: SituacaoDoAtor): DecisaoDaSaida {
  switch (atual.situacao) {
    case "SEM_CADASTRO":
      return { tipo: "ENCERRAR" };
    case "OK":
      return { tipo: "IR", destino: "/inicio" };
    case "SEM_SESSAO":
      return { tipo: "IR", destino: atual.destino };
    case "SEM_PERFIL":
      return { tipo: "IR", destino: "/sem-acesso" };
    default: {
      const desconhecida: never = atual;
      throw new Error(`situação do ator desconhecida: ${JSON.stringify(desconhecida)}`);
    }
  }
}
