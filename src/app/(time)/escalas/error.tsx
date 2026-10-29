"use client";

import { ErroDaPagina } from "../_componentes/ui/erro-da-pagina";

export default function ErroNaTela({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="as escalas" aoTentarDeNovo={reset} />;
}
