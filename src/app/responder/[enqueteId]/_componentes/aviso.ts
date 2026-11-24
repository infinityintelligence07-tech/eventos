import type { ResultadoDaRespostaDaEnquete } from "../acoes";

// O que o formulário mostra depois de cada envio. Sem dependência de servidor nem de React: testável sozinho.

/** Texto do pop-up que confirma a gravação. */
export const RESPOSTA_GRAVADA = "Tudo certo, sua resposta foi gravada!";

export type AvisoDaResposta =
  /** Nada foi enviado nesta visita (inclui a página recém-carregada). */
  | { tipo: "nenhum" }
  /** Gravou: abre o pop-up; o resumo fica abaixo dos eventos depois que ele fecha. */
  | { tipo: "gravada"; resumo: string }
  /** Não gravou (sessão, leitura, enquete encerrada): só a mensagem, sem pop-up. */
  | { tipo: "erro"; mensagem: string };

function resumoDaResposta(podem: number, total: number): string {
  if (podem === 0) return "Sua resposta: você não pode em nenhum destes eventos.";
  return `Sua resposta: você pode em ${podem} de ${total} ${total === 1 ? "evento" : "eventos"}.`;
}

export function avisoDaResposta(resultado: ResultadoDaRespostaDaEnquete): AvisoDaResposta {
  if (!resultado) return { tipo: "nenhum" };
  if (!resultado.ok) return { tipo: "erro", mensagem: resultado.mensagem };
  return { tipo: "gravada", resumo: `${resumoDaResposta(resultado.podem, resultado.total)} Você pode alterar até a enquete fechar.` };
}
