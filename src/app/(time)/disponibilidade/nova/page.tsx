import type { Metadata } from "next";

import { CAMPO, CabecalhoDaPagina, Cartao, classesDoBotao, FaixaSomenteLeitura, Migalha, Seletor } from "@/app/(time)/_componentes/ui";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarNovaEnquete } from "@/fluxos/disponibilidade";
import { periodoCurto } from "@/modules/disponibilidade";

import { type EventoParaEscolher, FormularioDaEnquete } from "./_componentes/formulario-da-enquete";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova enquete" };

type Parametros = { de?: string; ate?: string; polo?: string; tipo?: string };

const ROTULO = "mb-1 block text-[13px] font-medium text-[var(--ds-label)]";

export default async function PaginaNovaEnquete({ searchParams }: { searchParams: Promise<Parametros> }) {
  await exigirAtor();
  const parametros = await searchParams;
  const [nova, escrita] = await Promise.all([carregarNovaEnquete(parametros, new Date()), situacaoDaEscrita()]);
  const polos = new Map(nova.opcoes.polos.map((polo) => [polo.codigo, polo.nome]));
  const eventos: EventoParaEscolher[] = nova.eventos.map((evento) => ({
    id: evento.id,
    rotulo: evento.codigo ? `${evento.codigo} · ${evento.nome}` : evento.nome,
    periodo: periodoCurto(evento.dataInicio, evento.dataFim),
    polo: evento.poloCodigo ? (polos.get(evento.poloCodigo) ?? evento.poloCodigo) : null,
    masterclass: evento.tipoSigla === "MC",
  }));

  return (
    <>
      <CabecalhoDaPagina
        migalha={<Migalha itens={[{ rotulo: "Disponibilidade", href: "/disponibilidade" }, { rotulo: "Nova enquete" }]} />}
        titulo="Nova enquete"
        subtitulo="Escolha os eventos do período e copie o convite para o grupo do staff."
      />
      {!escrita.liberada && <FaixaSomenteLeitura />}

      <Cartao titulo="Período dos eventos" id="periodo" className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="filtro-de" className={ROTULO}>
              De
            </label>
            <input id="filtro-de" name="de" type="date" defaultValue={nova.periodo.de} className={CAMPO} />
          </div>
          <div>
            <label htmlFor="filtro-ate" className={ROTULO}>
              Até
            </label>
            <input id="filtro-ate" name="ate" type="date" defaultValue={nova.periodo.ate} className={CAMPO} />
          </div>
          <div>
            <label htmlFor="filtro-polo" className={ROTULO}>
              Polo
            </label>
            <Seletor
              id="filtro-polo"
              nome="polo"
              rotulo="Polo"
              className="w-auto min-w-[180px]"
              vazio="Todos os polos"
              valorInicial={nova.polo ?? ""}
              opcoes={nova.opcoes.polos.map((polo) => ({ valor: polo.codigo, rotulo: polo.nome }))}
            />
          </div>
          <div>
            <label htmlFor="filtro-tipo" className={ROTULO}>
              Tipo
            </label>
            <Seletor
              id="filtro-tipo"
              nome="tipo"
              rotulo="Tipo"
              className="w-auto min-w-[180px]"
              vazio="Todos os tipos"
              valorInicial={nova.tipo ?? ""}
              opcoes={nova.opcoes.tipos.map((tipo) => ({ valor: tipo.sigla, rotulo: tipo.nome }))}
            />
          </div>
          <button type="submit" className={classesDoBotao()}>
            Mostrar eventos
          </button>
        </form>
        <p className="mt-2 text-[12px] text-[var(--ds-label-2)]" aria-live="polite">
          {nova.eventos.length === 1 ? "1 evento" : `${nova.eventos.length} eventos`} de {periodoCurto(nova.periodo.de, nova.periodo.ate)}, sem os cancelados e
          concluídos.
        </p>
      </Cartao>

      <Cartao>
        <FormularioDaEnquete
          key={`${nova.periodo.de}-${nova.periodo.ate}-${nova.polo}-${nova.tipo}`}
          eventos={eventos}
          tituloSugerido={nova.tituloSugerido}
          fechaEmPadrao={nova.fechaEmPadrao}
          somenteLeitura={!escrita.liberada}
        />
      </Cartao>
    </>
  );
}
