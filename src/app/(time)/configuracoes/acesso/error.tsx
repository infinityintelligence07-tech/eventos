"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui/erro-da-pagina";

export default function ErroNoAcesso({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="o acesso do time" aoTentarDeNovo={reset} />;
}
