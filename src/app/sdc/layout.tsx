import type { Metadata } from "next";
import type { ReactNode } from "react";

import { sair } from "@/app/(time)/_servidor/sessao";

import { MolduraDaSdc } from "./_componentes/moldura-da-sdc";
import { exigirAtorSdc } from "./_servidor/ator-sdc";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "SDC", template: "%s · SDC · Eventos IAM" } };

/** Área da SDC (docs/09 §15), fora do (time): quem não é um ator SDC ativo não passa daqui e nada é lido antes. */
export default async function LayoutDaSdc({ children }: { children: ReactNode }) {
  const sdc = await exigirAtorSdc();
  return (
    <MolduraDaSdc nome={sdc.nome} email={sdc.email} sair={sair}>
      {children}
    </MolduraDaSdc>
  );
}
