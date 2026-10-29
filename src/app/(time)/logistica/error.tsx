"use client";

import { ErroDaPagina } from "../_componentes/ui/erro-da-pagina";

export default function ErroNaLogistica({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="a Logística" aoTentarDeNovo={reset} />;
}
