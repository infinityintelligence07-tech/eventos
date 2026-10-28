import type { ReactNode } from "react";

import { Painel } from "./_componentes/painel";

export default function LayoutDoTime({ children }: { children: ReactNode }) {
  return <Painel>{children}</Painel>;
}
