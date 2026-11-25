import type { Metadata } from "next";

import { AtalhosDeFiltro, BuscaDeFiltro, FaixaSomenteLeitura } from "@/app/(time)/_componentes/ui";
import { listarLocais } from "@/fluxos/eventos";
import { ORIGENS_DO_LOCAL, rotuloDoTipoDeLocal, type TipoDeLocal, TIPOS_DE_LOCAL, TIPOS_DE_LOCAL_DO_IAM_CONTROL } from "@/modules/eventos";

import { LocaisCadastrados } from "./_componentes/locais-cadastrados";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locais e hotéis" };

const PLURAL: Record<TipoDeLocal, string> = { EVENTO: "Locais de evento", HOTEL: "Hotéis", APARTAMENTO: "Apartamentos" };

export default async function PaginaLocais({ searchParams }: { searchParams: Promise<{ tipo?: string; origem?: string; busca?: string }> }) {
  await exigirAtor();
  const busca = await searchParams;
  const tipo = TIPOS_DE_LOCAL.find((valor) => valor === busca.tipo);
  const origem = ORIGENS_DO_LOCAL.find((valor) => valor === busca.origem);
  const texto = busca.busca?.trim().slice(0, 80) || undefined;
  const { locais, escritaLiberada } = await listarLocais({ tipo, origem, busca: texto });

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
            <AtalhosDeFiltro
              nome="origem"
              rotulo="Origem do cadastro"
              opcoes={[
                { valor: null, rotulo: "Qualquer origem" },
                { valor: "IAM_CONTROL", rotulo: "Do IAM Control" },
                { valor: "EVENTOS", rotulo: "Cadastrados no Eventos" },
              ]}
            />
          </>
        }
        locais={locais}
        tipos={TIPOS_DE_LOCAL.map((valor) => ({ valor, rotulo: rotuloDoTipoDeLocal(valor) }))}
        tiposDoIamControl={TIPOS_DE_LOCAL_DO_IAM_CONTROL.map((valor) => ({ valor, rotulo: rotuloDoTipoDeLocal(valor) }))}
        escritaLiberada={escritaLiberada}
        comFiltro={tipo !== undefined || origem !== undefined || texto !== undefined}
      />
    </>
  );
}
