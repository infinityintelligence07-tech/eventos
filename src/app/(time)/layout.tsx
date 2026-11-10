import type { ReactNode } from "react";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { staffDaIdentidade } from "@/fluxos/pessoas";

import { Painel } from "./_componentes/painel";
import { exigirAtor, identidadeDaSessao } from "./_servidor/usuario-atual";

export default async function LayoutDoTime({ children }: { children: ReactNode }) {
  // Camada 1 da autorização (docs/09 §4.1): sem ator com perfil do Eventos, nada do Eventos é lido.
  const ator = await exigirAtor();
  const escrita = await situacaoDaEscrita();
  const sessao = await identidadeDaSessao();
  const ehStaff = sessao !== null && (await staffDaIdentidade(sessao.identidade)) !== null;
  return (
    <Painel
      ambiente={{
        escritaLiberada: escrita.liberada,
        motivoDaEscrita: escrita.liberada ? undefined : escrita.motivo,
        usuario: { nome: ator.nome, email: ator.email, origem: ator.origem, perfis: [...ator.perfis], ehStaff },
      }}
    >
      {children}
    </Painel>
  );
}
