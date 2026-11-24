"use client";

import { type AtalhoDeFiltro, AtalhosDeFiltro, type OpcaoDeFiltro, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";

export function Filtros({
  recortes,
  polos,
  tipos,
  polo,
  tipo,
}: {
  /** Todos | Eventos | Palestras. Vem antes dos seletores porque limita os tipos que o seletor "Tipo" oferece. */
  recortes: AtalhoDeFiltro[];
  polos: OpcaoDeFiltro[];
  tipos: OpcaoDeFiltro[];
  polo: string | null;
  tipo: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AtalhosDeFiltro nome="mostrar" rotulo="Mostrar no calendário" opcoes={recortes} estilo="segmentado" />
      <SeletorDeFiltro nome="polo" rotulo="Polo" todos="Todos os polos" opcoes={polos} valor={polo} />
      {/* Com um tipo só (ex.: em "Palestras" só existe Masterclass) não há o que escolher. */}
      {tipos.length > 1 && <SeletorDeFiltro nome="tipo" rotulo="Tipo" todos="Todos os tipos" opcoes={tipos} valor={tipo} />}
    </div>
  );
}
