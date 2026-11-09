import { lerConfigDeEscrita } from "@/core/config/escrita";

/** Pura: o e-mail do ator é o do dono (sem diferenciar maiúsculas). Sem dono configurado, ninguém é. */
export function mesmoDono(email: string | null | undefined, emailDoDono: string | undefined): boolean {
  const limpo = email?.trim().toLowerCase();
  return Boolean(limpo && emailDoDono && limpo === emailDoDono.trim().toLowerCase());
}

/**
 * O dono do sistema (EVENTOS_DONO_EMAIL) pode auditar o que ele mesmo registrou ou o próprio custo (docs/10). O e-mail
 * vem do ator (no login, confirmado pelo Google). Configuração inválida ou ausente: ninguém é dono.
 */
export function ehDonoDoSistema(email: string | null | undefined): boolean {
  try {
    return mesmoDono(email, lerConfigDeEscrita().EVENTOS_DONO_EMAIL);
  } catch {
    return false;
  }
}
