"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui/erro-da-pagina";

export default function ErroNaSdc({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="os pedidos" aoTentarDeNovo={reset} />;
}
