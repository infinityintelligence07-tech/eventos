"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui/erro-da-pagina";

export default function ErroNaComunicacaoDoEvento({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="a Comunicação do evento" aoTentarDeNovo={reset} />;
}
