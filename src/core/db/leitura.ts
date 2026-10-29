import { modoLocal } from "@/core/ambiente";
import { lerConfig } from "@/core/config/leitura";

import { criarDb, type Db } from "./database";

// Banco das leituras das telas (docs/09 §6 e M4). Em core/db para os repositórios do módulo (o Calendário, que a
// página chama direto) e os fluxos usarem o mesmo caminho.

/** O cliente do ambiente (modo local: leitura e escrita no mesmo pool). */
export async function bancoDoAmbiente(): Promise<Db> {
  // Única exceção à regra de imports no topo (docs/07 §2.2): importar o cliente no topo
  // faria o build do Next exigir DATABASE_URL.
  const { db } = await import("./client");
  return db;
}

let somenteLeitura: Db | undefined;

/**
 * Leitura não tem trava (o Calendário lê a produção). Fora do modo local, o pool é próprio e toda transação nasce
 * somente leitura; o papel app_eventos_leitura também é configurado assim no banco.
 */
export async function bancoParaLeitura(): Promise<Db> {
  if (modoLocal()) return bancoDoAmbiente();
  somenteLeitura ??= criarDb(lerConfig().DATABASE_URL, "eventos-web-leitura", { somenteLeitura: true }).db;
  return somenteLeitura;
}
