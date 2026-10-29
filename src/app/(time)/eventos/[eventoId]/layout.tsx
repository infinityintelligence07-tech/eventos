import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, cache } from "react";

import { carregarCabecalhoDoEvento } from "@/fluxos/eventos";

import { type AbaDaPagina, AbasDaPagina, MigalhaDaSecao } from "../../_componentes/ui/abas-da-pagina";
import { Aviso } from "../../_componentes/ui/aviso";
import { CabecalhoDaPagina } from "../../_componentes/ui/cabecalho";
import { nomeCurtoDoEvento as nomeCurto, periodo } from "../../_componentes/ui/formatos";
import { ChipDaEscala } from "../../_componentes/ui/situacao";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

type Parametros = { params: Promise<{ eventoId: string }> };

const cabecalhoDoEvento = cache(carregarCabecalhoDoEvento);

function abasDoEvento(eventoId: string): AbaDaPagina[] {
  const raiz = `/eventos/${eventoId}`;
  return [
    { href: raiz, rotulo: "Resumo", exata: true },
    { href: `${raiz}/escala`, rotulo: "Escala" },
    { href: `${raiz}/comunicacao`, rotulo: "Comunicação" },
    { href: `${raiz}/logistica`, rotulo: "Logística" },
    { href: `${raiz}/custos`, rotulo: "Custos" },
  ];
}

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  await exigirAtor();
  const evento = await cabecalhoDoEvento((await params).eventoId);
  if (!evento) return { title: "Evento não encontrado" };
  const identificacao = evento.codigo ?? nomeCurto(evento);
  // O template não vale para a page.tsx do mesmo segmento (o Resumo): ela fica sem título e usa o default.
  return { title: { default: `Resumo · ${identificacao}`, template: `%s · ${identificacao} · Eventos IAM` } };
}

export default async function LayoutDoEvento({ params, children }: Parametros & { children: ReactNode }) {
  await exigirAtor();
  const { eventoId } = await params;
  const evento = await cabecalhoDoEvento(eventoId);
  if (!evento) notFound();

  const abas = abasDoEvento(evento.id);
  const informacoes = [
    periodo(evento.dataInicio, evento.dataFim),
    evento.poloNome || evento.poloCodigo ? `Polo ${evento.poloNome ?? evento.poloCodigo}` : null,
    evento.local ? `${evento.local.nome} · ${evento.local.cidade} (${evento.local.uf})` : null,
    evento.expectativaPublico !== null ? `${evento.expectativaPublico.toLocaleString("pt-BR")} pessoas esperadas` : null,
  ].filter(Boolean);

  return (
    <>
      <CabecalhoDaPagina
        migalha={<MigalhaDaSecao itens={[{ rotulo: "Calendário", href: "/calendario" }, { rotulo: evento.codigo ?? nomeCurto(evento) }]} abas={abas} />}
        titulo={nomeCurto(evento)}
        aoLadoDoTitulo={
          <>
            {evento.codigo && <span className="[font-family:var(--ds-font-mono)] text-[14px] font-medium text-[var(--ds-label-2)]">{evento.codigo}</span>}
            <ChipDaEscala situacao={evento.situacao} />
          </>
        }
        subtitulo={informacoes.join(" · ")}
      />
      {evento.status === "CANCELADO" && (
        <Aviso tom="perigo" className="mb-5">
          Este evento foi cancelado no IAM Control. A escala e as copys ficam só para consulta.
        </Aviso>
      )}
      {evento.codigo === null && evento.status !== "CANCELADO" && (
        <Aviso tom="atencao" className="mb-5">
          Este evento está sem código: falta a edição ou o polo no IAM Control. Corrija lá; o código aparece na próxima sincronização.
        </Aviso>
      )}
      <AbasDaPagina rotulo="Seções do evento" abas={abas} />
      {children}
    </>
  );
}
