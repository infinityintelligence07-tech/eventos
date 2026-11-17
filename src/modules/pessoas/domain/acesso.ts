import { z } from "zod";

// Configurações › Acesso do time: quem usa as telas do time e com que nível (docs/09 §3).
// No banco são os perfis EVENTOS_TIME e EVENTOS_LIDER em core.usuario_perfil; a líder tem os dois.

export const NIVEIS_DE_ACESSO = ["SEM_ACESSO", "TIME", "LIDER"] as const;
export type NivelDeAcesso = (typeof NIVEIS_DE_ACESSO)[number];

export function nivelDosPerfis(perfis: readonly string[]): NivelDeAcesso {
  if (perfis.includes("EVENTOS_LIDER")) return "LIDER";
  return perfis.includes("EVENTOS_TIME") ? "TIME" : "SEM_ACESSO";
}

/** Códigos de core.perfil que cada nível recebe. */
export type PerfilDoAcesso = "EVENTOS_TIME" | "EVENTOS_LIDER";

export function perfisDoNivel(nivel: NivelDeAcesso): PerfilDoAcesso[] {
  switch (nivel) {
    case "LIDER":
      return ["EVENTOS_LIDER", "EVENTOS_TIME"];
    case "TIME":
      return ["EVENTOS_TIME"];
    case "SEM_ACESSO":
      return [];
    default: {
      const desconhecido: never = nivel;
      throw new Error(`nível de acesso desconhecido: ${String(desconhecido)}`);
    }
  }
}

export function rotuloDoNivel(nivel: NivelDeAcesso): string {
  return nivel === "LIDER" ? "Líder" : nivel === "TIME" ? "Time" : "Sem acesso";
}

export const MENSAGEM_PROPRIO_ACESSO = "Você não pode alterar o próprio acesso. Peça a outra líder.";
export const MENSAGEM_USUARIO_INATIVO = "Esta conta está inativa no IAM Control e não pode receber acesso.";
export const MENSAGEM_USUARIO_SUMIU = "Esta conta não existe mais. Recarregue a página.";

export type AlvoDoAcesso = { usuarioId: string; ativo: boolean; nivel: NivelDeAcesso };

/** Por que a mudança não pode ser feita, ou null. Retirar o acesso vale também para conta inativa. */
export function motivoParaNaoAlterar(atorUsuarioId: string, alvo: AlvoDoAcesso | null, nivel: NivelDeAcesso): string | null {
  if (!alvo) return MENSAGEM_USUARIO_SUMIU;
  if (alvo.usuarioId === atorUsuarioId) return MENSAGEM_PROPRIO_ACESSO;
  if (nivel !== "SEM_ACESSO" && !alvo.ativo) return MENSAGEM_USUARIO_INATIVO;
  return null;
}

/** Nome da ação no histórico. Dado pessoal não vai para o registro: só os níveis. */
export function acaoDoHistorico(de: NivelDeAcesso, para: NivelDeAcesso): "ACESSO_CONCEDIDO" | "ACESSO_RETIRADO" | "ACESSO_ALTERADO" {
  if (de === "SEM_ACESSO") return "ACESSO_CONCEDIDO";
  return para === "SEM_ACESSO" ? "ACESSO_RETIRADO" : "ACESSO_ALTERADO";
}

export const definirAcessoSchema = z.object({
  usuarioId: z.uuid(),
  nivel: z.enum(NIVEIS_DE_ACESSO),
});
export type DefinirAcesso = z.infer<typeof definirAcessoSchema>;

export type PessoaComAcesso = { usuarioId: string; nome: string; email: string | null; ativo: boolean; nivel: NivelDeAcesso };
