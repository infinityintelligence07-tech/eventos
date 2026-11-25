import type { Ator } from "@/core/auth/ator";
import type { AtorSdc } from "@/core/auth/sdc";

export type { Ator, OrigemDoAtor, PerfilDoEventos } from "@/core/auth/ator";
export type { AtorSdc } from "@/core/auth/sdc";

/** O que a guarda de escrita precisa do ator (a permissão já foi conferida em executarAcao). */
export type AtorDaEscrita = Pick<Ator, "usuarioId" | "pessoaId" | "origem">;

/**
 * A pessoa da SDC escrevendo pela área dela (a action da SDC já conferiu que ela está ativa na lista). Não tem
 * usuarioId: os fluxos do time, que recebem AtorDaEscrita, não aceitam este tipo.
 */
export type AtorSdcDaEscrita = Pick<AtorSdc, "acessoSdcId" | "origem">;

/** Quem pode pedir uma transação de escrita. A trava 4 só olha a origem (SESSAO, LOCAL ou DEMO), igual para os dois. */
export type QuemEscreve = AtorDaEscrita | AtorSdcDaEscrita;
