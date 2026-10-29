import type { ReactNode } from "react";

import { situacaoDaEscrita } from "@/fluxos/_base";

import { Painel } from "./_componentes/painel";
import { exigirAtor } from "./_servidor/usuario-atual";

export default async function LayoutDoTime({ children }: { children: ReactNode }) {
  // Camada 1 da autorização (docs/09 §4.1): sem ator com perfil do Eventos, nada do Eventos é lido.
  const ator = await exigirAtor();
  const escrita = await situacaoDaEscrita();
  return (
    <Painel
      ambiente={{
        escritaLiberada: escrita.liberada,
        usuario: { nome: ator.nome, email: ator.email, origem: ator.origem, perfis: [...ator.perfis] },
      }}
    >
      {children}
    </Painel>
  );
}
