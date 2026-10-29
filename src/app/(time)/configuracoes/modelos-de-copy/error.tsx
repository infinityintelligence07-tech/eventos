"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui/erro-da-pagina";

export default function ErroNosModelosDeCopy({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="os modelos de copy" aoTentarDeNovo={reset} />;
}
