import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { classesDoBotao, type TamanhoDoBotao, type VarianteDoBotao } from "./classes";

/** Link com cara de botão (navegação). Para ação, use `Botao`. */
export function BotaoLink({
  variante = "secundario",
  tamanho = "normal",
  icone,
  className = "",
  children,
  ...resto
}: ComponentProps<typeof Link> & { variante?: VarianteDoBotao; tamanho?: TamanhoDoBotao; icone?: ReactNode }) {
  return (
    <Link {...resto} className={`${classesDoBotao({ variante, tamanho })} ${className}`}>
      {icone}
      {children}
    </Link>
  );
}
