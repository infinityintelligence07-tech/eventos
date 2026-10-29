"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui/erro-da-pagina";

export default function ErroNosLocais({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="os locais e hotéis" aoTentarDeNovo={reset} />;
}
