"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui";

export default function ErroNaDisponibilidade({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="a disponibilidade" aoTentarDeNovo={reset} />;
}
