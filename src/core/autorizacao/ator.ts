import type { Ator } from "@/core/auth/ator";

export type { Ator, OrigemDoAtor, PerfilDoEventos } from "@/core/auth/ator";

/** O que a guarda de escrita precisa do ator (a permissão já foi conferida em executarAcao). */
export type AtorDaEscrita = Pick<Ator, "usuarioId" | "pessoaId" | "origem">;
