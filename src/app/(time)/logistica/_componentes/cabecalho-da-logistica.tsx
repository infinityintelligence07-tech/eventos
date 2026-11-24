import type { ReactNode } from "react";

import { type AbaDaPagina, AbasDaPagina, MigalhaDaSecao } from "../../_componentes/ui/abas-da-pagina";
import { CabecalhoDaPagina } from "../../_componentes/ui/cabecalho";

// Voos e Hospedagem são itens separados no menu. Cada um tem as suas abas: Caronas fica com Voos (como a pessoa
// chega ao evento) e Créditos de hotel com Hospedagem (onde ela dorme). As rotas continuam em /logistica.

const ABAS_DE_VOOS: AbaDaPagina[] = [
  { href: "/logistica/voos", rotulo: "Voos (SDC)" },
  { href: "/logistica/caronas", rotulo: "Caronas" },
];

const ABAS_DE_HOSPEDAGEM: AbaDaPagina[] = [
  { href: "/logistica/hospedagem", rotulo: "Hotéis e quartos" },
  { href: "/logistica/creditos", rotulo: "Créditos de hotel" },
];

type Secao = { titulo: string; subtitulo: string; href: string; abas: AbaDaPagina[] };

const VOOS: Secao = { titulo: "Voos", subtitulo: "Passagens pela SDC e caronas do staff.", href: "/logistica/voos", abas: ABAS_DE_VOOS };
const HOSPEDAGEM: Secao = {
  titulo: "Hospedagem",
  subtitulo: "Hotéis, quartos e quem divide com quem.",
  href: "/logistica/hospedagem",
  abas: ABAS_DE_HOSPEDAGEM,
};

/** Cabeçalho e abas; fica em cada página para a ação principal da aba ir na área de ações. */
function Cabecalho({ secao, acoes }: { secao: Secao; acoes?: ReactNode }) {
  return (
    <>
      <CabecalhoDaPagina
        migalha={<MigalhaDaSecao itens={[{ rotulo: secao.titulo, href: secao.href }]} abas={secao.abas} />}
        titulo={secao.titulo}
        subtitulo={secao.subtitulo}
        acoes={acoes}
      />
      <AbasDaPagina rotulo={`Seções de ${secao.titulo}`} abas={secao.abas} />
    </>
  );
}

/** Telas do item Voos do menu: /logistica/voos e /logistica/caronas. */
export function CabecalhoDeVoos({ acoes }: { acoes?: ReactNode }) {
  return <Cabecalho secao={VOOS} acoes={acoes} />;
}

/** Telas do item Hospedagem do menu: /logistica/hospedagem e /logistica/creditos. */
export function CabecalhoDeHospedagem({ acoes }: { acoes?: ReactNode }) {
  return <Cabecalho secao={HOSPEDAGEM} acoes={acoes} />;
}
