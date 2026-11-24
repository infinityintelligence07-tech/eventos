import type { ReactNode } from "react";

import { type AbaDaPagina, AbasDaPagina, MigalhaDaSecao } from "../../_componentes/ui/abas-da-pagina";
import { CabecalhoDaPagina } from "../../_componentes/ui/cabecalho";

// Voos e Hospedagem são itens separados no menu; as rotas continuam em /logistica. Voos tem uma tela só. Hospedagem
// junta quartos e caronas na mesma tela (quem dorme com quem e quem vai com quem, numa passada) e tem a aba de créditos.

const ABAS_DE_HOSPEDAGEM: AbaDaPagina[] = [
  { href: "/logistica/hospedagem", rotulo: "Quartos e caronas" },
  { href: "/logistica/creditos", rotulo: "Créditos de hotel" },
];

/** Tela do item Voos do menu (/logistica/voos). Sem abas nem migalha: é uma tela só. */
export function CabecalhoDeVoos({ acoes }: { acoes?: ReactNode }) {
  return <CabecalhoDaPagina titulo="Voos" subtitulo="Passagens do staff pela SDC." acoes={acoes} />;
}

/** Telas do item Hospedagem do menu: /logistica/hospedagem (quartos e caronas) e /logistica/creditos. A ação principal da aba vai em `acoes`. */
export function CabecalhoDeHospedagem({ acoes }: { acoes?: ReactNode }) {
  return (
    <>
      <CabecalhoDaPagina
        migalha={<MigalhaDaSecao itens={[{ rotulo: "Hospedagem", href: "/logistica/hospedagem" }]} abas={ABAS_DE_HOSPEDAGEM} />}
        titulo="Hospedagem"
        subtitulo="Quartos e caronas de cada evento: quem dorme com quem e quem vai com quem."
        acoes={acoes}
      />
      <AbasDaPagina rotulo="Seções de Hospedagem" abas={ABAS_DE_HOSPEDAGEM} />
    </>
  );
}
