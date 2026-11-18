import type { ReactNode } from "react";

import { type AbaDaPagina, AbasDaPagina, MigalhaDaSecao } from "../../_componentes/ui/abas-da-pagina";
import { CabecalhoDaPagina } from "../../_componentes/ui/cabecalho";

const ABAS: AbaDaPagina[] = [
  { href: "/logistica/voos", rotulo: "Voos (SDC)" },
  { href: "/logistica/hospedagem", rotulo: "Hospedagem" },
  { href: "/logistica/caronas", rotulo: "Caronas" },
  { href: "/logistica/creditos", rotulo: "Créditos de hotel" },
];

/** Cabeçalho e abas da Logística; fica em cada página para a ação principal da aba ir na área de ações. */
export function CabecalhoDaLogistica({ acoes }: { acoes?: ReactNode }) {
  return (
    <>
      <CabecalhoDaPagina
        migalha={<MigalhaDaSecao itens={[{ rotulo: "Voos e Hospedagem", href: "/logistica/voos" }]} abas={ABAS} />}
        titulo="Voos e Hospedagem"
        subtitulo="Voos, hospedagem e caronas do staff."
        acoes={acoes}
      />
      <AbasDaPagina rotulo="Seções da logística" abas={ABAS} />
    </>
  );
}
