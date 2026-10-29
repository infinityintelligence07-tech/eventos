import type { ClientBase } from "pg";

import type { Db } from "@/core/db/database";

/** "Quem está usando o sistema" no modo local (Time A). Ids fixos, documentados no README e no doc 07 §3.2. */
export const USUARIO_TESTE_ID = "7e570000-0000-7000-8000-000000000001";
export const PESSOA_TESTE_ID = "7e570000-0000-7000-8000-000000000002";

export type UsuarioLocal = {
  usuarioId: string;
  /** Nulo = a pessoa é ligada pela semente a um staff fictício (tem convocação e custo). */
  pessoaId: string | null;
  nome: string;
  email: string;
  perfil: "EVENTOS_TIME" | "EVENTOS_LIDER" | null;
};

/** Seletor "Entrar como" do modo local (doc 09 §3.3). Ids fixos. */
export const USUARIOS_LOCAIS: readonly UsuarioLocal[] = [
  { usuarioId: USUARIO_TESTE_ID, pessoaId: PESSOA_TESTE_ID, nome: "Time A (teste)", email: "time-a@exemplo.test", perfil: "EVENTOS_TIME" },
  { usuarioId: "7e570000-0000-7000-8000-000000000003", pessoaId: null, nome: "Time B (teste)", email: "time-b@exemplo.test", perfil: "EVENTOS_TIME" },
  { usuarioId: "7e570000-0000-7000-8000-000000000005", pessoaId: "7e570000-0000-7000-8000-000000000006", nome: "Líder (teste)", email: "lider@exemplo.test", perfil: "EVENTOS_LIDER" },
  { usuarioId: "7e570000-0000-7000-8000-000000000007", pessoaId: "7e570000-0000-7000-8000-000000000008", nome: "Sem perfil (teste)", email: "sem-perfil@exemplo.test", perfil: null },
];

// Centro aproximado da cidade de cada polo, DDD (telefones fictícios) e aeroporto mais usado.
export const CIDADES: Record<string, { lat: number; lng: number; ddd: string; iata: string }> = {
  AM: { lat: -22.7394, lng: -47.3314, ddd: "19", iata: "VCP" },
  BC: { lat: -26.9906, lng: -48.6348, ddd: "47", iata: "NVT" },
  BSB: { lat: -15.7939, lng: -47.8828, ddd: "61", iata: "BSB" },
  CPS: { lat: -22.9056, lng: -47.0608, ddd: "19", iata: "VCP" },
  GYN: { lat: -16.6869, lng: -49.2648, ddd: "62", iata: "GYN" },
  LON: { lat: -23.3045, lng: -51.1696, ddd: "43", iata: "LDB" },
  POA: { lat: -30.0346, lng: -51.2177, ddd: "51", iata: "POA" },
  VIX: { lat: -20.3155, lng: -40.3128, ddd: "27", iata: "VIX" },
};

export type Coordenada = { lat: number; lng: number };

export type Pessoa = {
  id: string;
  nome: string;
  poloCodigo: string;
  sexo: "F" | "M" | null;
  /** Nulo = cadastro sem coordenada (cenário de "falta dado"). */
  coordenada: Coordenada | null;
  funcoes: string[];
  temVeiculo: boolean;
};

export type Executor = Pick<ClientBase, "query">;

/** O mesmo cliente da transação da semente, visto pelo Drizzle (para usar os repositórios dos módulos). */
export type Banco = { sql: Executor; drizzle: Db };

/** mulberry32: aleatório determinístico. */
export function gerador(semente: number): () => number {
  let a = semente;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
