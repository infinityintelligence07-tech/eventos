import type { ReactNode } from "react";

import { situacaoDaEscrita } from "@/fluxos/_base";

import { Painel } from "./_componentes/painel";
import { usuarioAtual } from "./_servidor/usuario-atual";

export default async function LayoutDoTime({ children }: { children: ReactNode }) {
  const [escrita, usuario] = await Promise.all([situacaoDaEscrita(), usuarioAtual()]);
  return <Painel ambiente={{ escritaLiberada: escrita.liberada, usuario: usuario?.nome ?? null }}>{children}</Painel>;
}
