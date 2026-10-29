import { bancoParaLeitura } from "@/core/db/leitura";

import { criarRepositorioCalendario, type RepositorioCalendario } from "./calendario-repository";

/** Repositório do Calendário para a página: mesmo banco de leitura dos fluxos (somente leitura fora do modo local). */
export async function repositorioCalendario(): Promise<RepositorioCalendario> {
  return criarRepositorioCalendario(await bancoParaLeitura());
}
