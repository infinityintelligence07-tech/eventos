"use client";

import { ErroDaPagina } from "@/app/(time)/_componentes/ui";

export default function ErroEmPessoas({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaPagina tela="as pessoas" aoTentarDeNovo={reset} />;
}
