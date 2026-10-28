import { criarRepositorioCalendario, type RepositorioCalendario } from "./calendario-repository";

// Repositórios ligados ao banco do ambiente, para as páginas. O cliente do banco é importado só
// na primeira chamada: importar no topo faria o build do Next exigir DATABASE_URL.
export async function repositorioCalendario(): Promise<RepositorioCalendario> {
  const { db } = await import("@/core/db/client");
  return criarRepositorioCalendario(db);
}
