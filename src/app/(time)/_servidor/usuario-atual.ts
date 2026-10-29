import { modoLocal, USUARIO_TESTE } from "@/core/ambiente";

export type UsuarioAtual = { id: string; nome: string };

/** Sem login nesta rodada: no modo local é o usuário de teste; fora dele, ninguém (toda escrita é recusada). */
export async function usuarioAtual(): Promise<UsuarioAtual | null> {
  return modoLocal() ? { ...USUARIO_TESTE } : null;
}
