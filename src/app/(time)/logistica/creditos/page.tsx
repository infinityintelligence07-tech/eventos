import { Hotel } from "lucide-react";
import type { Metadata } from "next";

import { Cartao, Chip, EstadoVazio } from "@/app/(time)/_componentes/ui";

import { CabecalhoDaLogistica } from "../_componentes/cabecalho-da-logistica";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Créditos de hotel" };

export default function PaginaCreditos() {
  return (
    <>
      <CabecalhoDaLogistica />
      <Cartao espacamento="nenhum">
        <EstadoVazio icone={<Hotel size={32} aria-hidden />} titulo="Créditos de hotel" nivel="h2" acao={<Chip tom="neutro">em breve</Chip>}>
          Os créditos de hotel e a conferência da fatura da SDC entram numa próxima rodada.
        </EstadoVazio>
      </Cartao>
    </>
  );
}
