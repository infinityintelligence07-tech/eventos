"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { PainelLateral } from "./dialogo";

/** Painel lateral aberto por parâmetro na URL (?ref=, ?novo=1, ?protocolo=). Fechar volta para `aoFecharIrPara`. */
export function PainelPelaUrl({
  titulo,
  subtitulo,
  largura,
  aoFecharIrPara,
  rodape,
  alteracoesNaoSalvas,
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  largura?: 520 | 720;
  aoFecharIrPara: string;
  rodape?: ReactNode;
  alteracoesNaoSalvas?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <PainelLateral
      aberto
      titulo={titulo}
      subtitulo={subtitulo}
      largura={largura}
      rodape={rodape}
      alteracoesNaoSalvas={alteracoesNaoSalvas}
      aoFechar={() => router.push(aoFecharIrPara, { scroll: false })}
    >
      {children}
    </PainelLateral>
  );
}
