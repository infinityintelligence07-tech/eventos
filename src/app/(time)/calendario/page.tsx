import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  type Calendario,
  carregarCalendario,
  RECORTE_PADRAO,
  type RecorteDoCalendario,
  repositorioCalendario,
  type SituacaoNoCalendario,
} from "@/modules/eventos";

import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { CARTAO, classesDoBotao } from "../_componentes/ui/classes";
import { CartaoDeNumero } from "../_componentes/ui/cartao";
import { ChipDaEscala } from "../_componentes/ui/situacao";
import { Filtros } from "./_componentes/filtros";
import { SemanaDoMes } from "./_componentes/semana-do-mes";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendário" };

type Parametros = { mes?: string; polo?: string; tipo?: string; mostrar?: string };

// Segunda a domingo, como no IAM Control: o evento de quinta a domingo vira uma faixa só.
const DIAS_DA_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const RECORTES: { recorte: RecorteDoCalendario; rotulo: string }[] = [
  { recorte: "todos", rotulo: "Todos" },
  { recorte: "eventos", rotulo: "Eventos" },
  { recorte: "palestras", rotulo: "Palestras" },
];
const LEGENDA: SituacaoNoCalendario[] = [
  "SEM_ESCALA",
  "RASCUNHO",
  "AGUARDANDO_APROVACAO",
  "DEVOLVIDA",
  "APROVADA",
  "COMUNICADA",
  "CANCELADO",
];
const BOTAO = classesDoBotao();

function enderecoDoMes(mes: string, { polo, tipo, recorte }: Calendario["filtros"]): string {
  const parametros = new URLSearchParams({ mes });
  if (polo) parametros.set("polo", polo);
  if (tipo) parametros.set("tipo", tipo);
  if (recorte !== RECORTE_PADRAO) parametros.set("mostrar", recorte);
  return `/calendario?${parametros.toString()}`;
}

function quandoSincronizou(instante: Date | null): string {
  if (!instante) return "Turmas do IAM Control ainda não sincronizadas.";
  const quando = instante.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Turmas do IAM Control sincronizadas em ${quando.replace(", ", " às ")}.`;
}

export default async function PaginaCalendario({ searchParams }: { searchParams: Promise<Parametros> }) {
  await exigirAtor();
  const parametros = await searchParams;
  const calendario = await carregarCalendario(await repositorioCalendario(), {
    ...parametros,
    agora: new Date(),
  });
  const { filtros, resumo } = calendario;

  return (
    <>
      <CabecalhoDaPagina titulo="Calendário" subtitulo={quandoSincronizou(calendario.ultimaSincronizacao)} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CartaoDeNumero rotulo="Eventos no mês" valor={resumo.eventos} />
        <CartaoDeNumero rotulo="Masterclasses no mês" valor={resumo.masterclasses} />
        <CartaoDeNumero rotulo="Vagas sugeridas" valor={resumo.vagas} />
      </div>

      <section className={`${CARTAO} min-w-0 p-4 md:p-5`} aria-label={`Calendário de ${calendario.nomeDoMes}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={enderecoDoMes(calendario.mesAnterior, filtros)} className={BOTAO} aria-label="Mês anterior">
              <ChevronLeft size={18} />
            </Link>
            <Link href={enderecoDoMes(calendario.proximoMes, filtros)} className={BOTAO} aria-label="Próximo mês">
              <ChevronRight size={18} />
            </Link>
            <h2 className="ml-1 text-[20px] font-semibold tracking-[-0.015em]">{calendario.nomeDoMes}</h2>
            {calendario.mes !== calendario.mesDeHoje && (
              <Link href={enderecoDoMes(calendario.mesDeHoje, filtros)} className={`${BOTAO} ml-1`}>
                Hoje
              </Link>
            )}
          </div>
          <Filtros
            recortes={RECORTES.map(({ recorte, rotulo }) => ({ valor: recorte === RECORTE_PADRAO ? null : recorte, rotulo }))}
            polos={filtros.polos.map((polo) => ({ valor: polo.codigo, rotulo: `${polo.nome} (${polo.codigo})` }))}
            tipos={filtros.tipos.map((tipo) => ({ valor: tipo.sigla, rotulo: tipo.nome }))}
            polo={filtros.polo}
            tipo={filtros.tipo}
          />
        </div>

        <ul className="mb-3 flex flex-wrap gap-2 text-[12px]" aria-label="Legenda">
          {LEGENDA.map((situacao) => (
            <li key={situacao}>
              <ChipDaEscala situacao={situacao} />
            </li>
          ))}
        </ul>

        {/* relative: sem ele, os textos sr-only (position: absolute) escapam da rolagem e alargam a página no celular. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[840px] table-fixed border-collapse">
            <thead>
              <tr>
                {DIAS_DA_SEMANA.map((dia) => (
                  <th key={dia} scope="col" className="pb-2 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                    {dia}
                  </th>
                ))}
              </tr>
            </thead>
            {calendario.semanas.map((semana) => (
              <SemanaDoMes key={semana.dias[0]!.data} semana={semana} />
            ))}
          </table>
        </div>
        <p className="mt-3 text-[12px] text-[var(--ds-label-2)]">Clique num evento para abrir. Passe o mouse ou o foco do teclado para ver código, período, público e vagas.</p>
      </section>
    </>
  );
}
