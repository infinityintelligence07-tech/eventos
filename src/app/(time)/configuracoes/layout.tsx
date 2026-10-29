import type { Metadata } from "next";
import type { ReactNode } from "react";

import { type AbaDaPagina, AbasDaPagina } from "../_componentes/ui/abas-da-pagina";
import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";

export const metadata: Metadata = { title: { default: "Configurações", template: "%s · Configurações · Eventos IAM" } };

const ABAS: AbaDaPagina[] = [
  { href: "/configuracoes/regras-de-custo", rotulo: "Regras de custo" },
  { href: "/configuracoes/vagas", rotulo: "Vagas por tipo de evento" },
  { href: "/configuracoes/modelos-de-copy", rotulo: "Modelos de copy" },
  { href: "/configuracoes/locais", rotulo: "Locais e hotéis" },
];

export default function LayoutDasConfiguracoes({ children }: { children: ReactNode }) {
  return (
    <>
      <CabecalhoDaPagina titulo="Configurações" subtitulo="Valores e modelos usados pelo sistema. Mudanças valem dali em diante." />
      <AbasDaPagina rotulo="Seções das configurações" abas={ABAS} />
      {children}
    </>
  );
}
