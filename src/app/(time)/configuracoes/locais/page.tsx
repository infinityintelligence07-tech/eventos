import type { Metadata } from "next";

import { AtalhosDeFiltro, BuscaDeFiltro, FaixaSomenteLeitura } from "@/app/(time)/_componentes/ui";
import { listarLocais } from "@/fluxos/eventos";
import { rotuloDoTipoDeLocal, type TipoDeLocal, TIPOS_DE_LOCAL } from "@/modules/eventos";

import { LocaisCadastrados } from "./_componentes/locais-cadastrados";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locais e hotéis" };

const PLURAL: Record<TipoDeLocal, string> = { EVENTO: "Locais de evento", HOTEL: "Hotéis", APARTAMENTO: "Apartamentos" };

export default async function PaginaLocais({ searchParams }: { searchParams: Promise<{ tipo?: string; busca?: string }> }) {
  await exigirAtor();
  const busca = await searchParams;
  const tipo = TIPOS_DE_LOCAL.find((valor) => valor === busca.tipo);
  const texto = busca.busca?.trim().slice(0, 80) || undefined;
  const { locais, escritaLiberada } = await listarLocais({ tipo, busca: texto });

  return (
    <>
      {!escritaLiberada && <FaixaSomenteLeitura />}
      <p className="sr-only" aria-live="polite">
        {locais.length === 1 ? "1 local encontrado" : `${locais.length} locais encontrados`}
      </p>
      <LocaisCadastrados
        filtros={
          <>
            <BuscaDeFiltro rotulo="Buscar por nome ou cidade" placeholder="Buscar por nome ou cidade" />
            <AtalhosDeFiltro
              nome="tipo"
              rotulo="Tipo de local"
              opcoes={[{ valor: null, rotulo: "Todos" }, ...TIPOS_DE_LOCAL.map((valor) => ({ valor, rotulo: PLURAL[valor] }))]}
            />
          </>
        }
        locais={locais}
        tipos={TIPOS_DE_LOCAL.map((valor) => ({ valor, rotulo: rotuloDoTipoDeLocal(valor) }))}
        escritaLiberada={escritaLiberada}
        comFiltro={tipo !== undefined || texto !== undefined}
      />
    </>
  );
}
