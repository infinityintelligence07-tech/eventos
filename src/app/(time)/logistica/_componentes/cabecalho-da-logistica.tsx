import type { ReactNode } from "react";

import { type AbaDaPagina, AbasDaPagina, MigalhaDaSecao } from "../../_componentes/ui/abas-da-pagina";
import { CabecalhoDaPagina } from "../../_componentes/ui/cabecalho";

// Voos e Hospedagem são itens separados no menu; as rotas continuam em /logistica. Voos tem uma tela só. Hospedagem
// tem os quartos (quem dorme com quem) e a aba de créditos. As caronas ficam na escala do evento.

const ABAS_DE_HOSPEDAGEM: AbaDaPagina[] = [
  { href: "/logistica/hospedagem", rotulo: "Quartos" },
  { href: "/logistica/creditos", rotulo: "Créditos de hotel" },
];

/** Tela do item Voos do menu (/logistica/voos). Sem abas nem migalha: é uma tela só. */
export function CabecalhoDeVoos({ acoes }: { acoes?: ReactNode }) {
  return <CabecalhoDaPagina titulo="Voos" subtitulo="Passagens do staff pela SDC." acoes={acoes} />;
}

/** Telas do item Hospedagem do menu: /logistica/hospedagem (quartos) e /logistica/creditos. A ação principal da aba vai em `acoes`. */
export function CabecalhoDeHospedagem({ acoes }: { acoes?: ReactNode }) {
  return (
    <>
      <CabecalhoDaPagina
        migalha={<MigalhaDaSecao itens={[{ rotulo: "Hospedagem", href: "/logistica/hospedagem" }]} abas={ABAS_DE_HOSPEDAGEM} />}
        titulo="Hospedagem"
        subtitulo="Quartos de cada evento: quem dorme com quem."
        acoes={acoes}
      />
      <AbasDaPagina rotulo="Seções de Hospedagem" abas={ABAS_DE_HOSPEDAGEM} />
    </>
  );
}
