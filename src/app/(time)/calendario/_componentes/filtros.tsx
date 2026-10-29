"use client";

import { type OpcaoDeFiltro, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";

export function Filtros({
  polos,
  tipos,
  polo,
  tipo,
}: {
  polos: OpcaoDeFiltro[];
  tipos: OpcaoDeFiltro[];
  polo: string | null;
  tipo: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SeletorDeFiltro nome="polo" rotulo="Polo" todos="Todos os polos" opcoes={polos} valor={polo} />
      <SeletorDeFiltro nome="tipo" rotulo="Tipo" todos="Todos os tipos" opcoes={tipos} valor={tipo} />
    </div>
  );
}
