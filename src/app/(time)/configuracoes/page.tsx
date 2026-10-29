import { redirect } from "next/navigation";

import { inicioDasConfiguracoes } from "../_componentes/menu";
import { exigirAtor } from "../_servidor/usuario-atual";

export default async function PaginaConfiguracoes() {
  const ator = await exigirAtor();
  redirect(inicioDasConfiguracoes(ator));
}
