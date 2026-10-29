"use client";

import { ErroDaPagina } from "../_componentes/ui/erro-da-pagina";

export default function ErroNosCustos({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="os Custos" aoTentarDeNovo={reset} />;
}
