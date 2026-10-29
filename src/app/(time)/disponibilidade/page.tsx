import { CalendarCheck, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AtalhosDeFiltro, BotaoLink, CabecalhoDaPagina, EstadoVazio, formatar } from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import { type FiltroDaListaDeEnquetes, listarEnquetes } from "@/fluxos/disponibilidade";

import { ChipDaEnquete } from "./_componentes/chip-da-enquete";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Disponibilidade" };

type Parametros = { situacao?: string };

function filtroDaUrl(valor: string | undefined): FiltroDaListaDeEnquetes {
  return valor === "abertas" || valor === "encerradas" ? valor : null;
}

const NOVA_ENQUETE = (
  <BotaoLink href="/disponibilidade/nova" variante="primario" icone={<Plus size={18} aria-hidden />}>
    Nova enquete
  </BotaoLink>
);

export default async function PaginaDisponibilidade({ searchParams }: { searchParams: Promise<Parametros> }) {
  await exigirAtor();
  const filtro = filtroDaUrl((await searchParams).situacao);
  const agora = new Date();
  const { enquetes, totalDeStaff, quantidade } = await listarEnquetes(filtro, agora);

  return (
    <>
      <CabecalhoDaPagina titulo="Disponibilidade" subtitulo="Pergunte ao staff em quais eventos pode trabalhar." acoes={NOVA_ENQUETE} />

      {quantidade.todas === 0 ? (
        <section className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
          <EstadoVazio icone={<CalendarCheck size={32} aria-hidden />} titulo="Nenhuma enquete ainda." nivel="h2" acao={NOVA_ENQUETE}>
            Crie uma enquete para saber quem pode trabalhar nos próximos eventos.
          </EstadoVazio>
        </section>
      ) : (
        <>
          <div className="mb-4">
            <AtalhosDeFiltro
              nome="situacao"
              rotulo="Situação da enquete"
              opcoes={[
                { valor: "abertas", rotulo: "Abertas", quantidade: quantidade.abertas },
                { valor: "encerradas", rotulo: "Encerradas", quantidade: quantidade.encerradas },
                { valor: null, rotulo: "Todas", quantidade: quantidade.todas },
              ]}
            />
            <p className="sr-only" aria-live="polite">
              {enquetes.length === 1 ? "1 enquete encontrada" : `${enquetes.length} enquetes encontradas`}
            </p>
          </div>

          {enquetes.length === 0 ? (
            <section className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
              <EstadoVazio
                titulo="Nenhum resultado com esses filtros."
                acao={
                  <Link href="/disponibilidade" className="text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline">
                    Limpar filtros
                  </Link>
                }
              />
            </section>
          ) : (
            <Tabela legenda="Enquetes de disponibilidade">
              <CabecaDaTabela>
                <ColunaDaTabela>Título</ColunaDaTabela>
                <ColunaDaTabela numero>Eventos</ColunaDaTabela>
                <ColunaDaTabela>Fecha em</ColunaDaTabela>
                <ColunaDaTabela numero>Respostas</ColunaDaTabela>
                <ColunaDaTabela>Situação</ColunaDaTabela>
              </CabecaDaTabela>
              <tbody>
                {enquetes.map((enquete) => (
                  <LinhaDaTabela key={enquete.id}>
                    <CelulaDaTabela cabecalhoDaLinha>
                      <Link href={`/disponibilidade/${enquete.id}`} className="text-[var(--ds-tint-text)] hover:underline">
                        {enquete.titulo}
                      </Link>
                    </CelulaDaTabela>
                    <CelulaDaTabela numero>{enquete.eventos === 1 ? "1 evento" : `${enquete.eventos} eventos`}</CelulaDaTabela>
                    <CelulaDaTabela>
                      <time dateTime={enquete.fechaEm.toISOString()}>{formatar.dataEHora(enquete.fechaEm)}</time>
                    </CelulaDaTabela>
                    <CelulaDaTabela numero>{formatar.quantidadeDe(enquete.responderam, totalDeStaff, "pessoas")}</CelulaDaTabela>
                    <CelulaDaTabela>
                      <ChipDaEnquete situacao={enquete.situacao} />
                    </CelulaDaTabela>
                  </LinhaDaTabela>
                ))}
              </tbody>
            </Tabela>
          )}
        </>
      )}
    </>
  );
}
