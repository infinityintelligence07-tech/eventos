import type { NextRequest } from "next/server";

import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import type { AtorDoStaff } from "@/fluxos/custos";
import { staffDaIdentidade } from "@/fluxos/pessoas";

// Quem está usando o formulário de custo do staff. Vale para as server actions e para as rotas de comprovante: a
// pessoa sai sempre da sessão, nunca do que o navegador mandou.

export type SessaoDoStaff = { ok: true; ator: AtorDoStaff } | { ok: false; mensagem: string; motivo: "SEM_SESSAO" | "NAO_E_STAFF" };

export async function staffDaSessao(): Promise<SessaoDoStaff> {
  const sessao = await identidadeDaSessao();
  if (!sessao) return { ok: false, motivo: "SEM_SESSAO", mensagem: "Sua sessão terminou. Entre de novo." };
  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) return { ok: false, motivo: "NAO_E_STAFF", mensagem: "Seu usuário não está no cadastro de staff." };
  return { ok: true, ator: { usuarioId: staff.usuarioId, pessoaId: staff.pessoaId, origem: sessao.origem } };
}

/**
 * Rota que grava (POST, DELETE) só aceita pedido da própria página. Server action já confere a origem; route handler
 * não. Sem o cabeçalho (navegador antigo) vale o SameSite=lax dos cookies: pedido de outro site chega sem sessão.
 */
export function veioDoProprioSite(request: NextRequest): boolean {
  const origem = request.headers.get("sec-fetch-site");
  return origem === null || origem === "same-origin";
}
