import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  type Calendario,
  carregarCalendario,
  type DiaDoCalendario,
  DIAS_PARA_MONTAR_ESCALA,
  type EventoNoCalendario,
  repositorioCalendario,
  type SituacaoNoCalendario,
} from "@/modules/eventos";

import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { CARTAO, classesDoBotao } from "../_componentes/ui/classes";
import { CartaoDeNumero, CartaoDePendencia, type ExemploDePendencia } from "../_componentes/ui/cartao";
import { ChipDaEscala } from "../_componentes/ui/situacao";
import { CartaoDoEvento, diaEMes, rotuloCurto } from "./_componentes/cartao-do-evento";
import { Filtros } from "./_componentes/filtros";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendário" };

type Parametros = { mes?: string; polo?: string; tipo?: string };

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
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

function enderecoDoMes(mes: string, { polo, tipo }: Calendario["filtros"]): string {
  const parametros = new URLSearchParams({ mes });
  if (polo) parametros.set("polo", polo);
  if (tipo) parametros.set("tipo", tipo);
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

function resumoDasMasterclasses(ativas: number, canceladas: number): string {
  const plural = (quantidade: number, singular: string, varias: string) => `${quantidade} ${quantidade === 1 ? singular : varias}`;
  if (ativas === 0) return plural(canceladas, "Masterclass cancelada", "Masterclasses canceladas");
  const texto = plural(ativas, "Masterclass", "Masterclasses");
  return canceladas > 0 ? `${texto} (+${plural(canceladas, "cancelada", "canceladas")})` : texto;
}

function Dia({ dia }: { dia: DiaDoCalendario }) {
  const ativas = dia.masterclasses.filter((mc) => mc.status !== "CANCELADO").length;
  const canceladas = dia.masterclasses.length - ativas;
  return (
    <td className={`h-[132px] border border-[var(--ds-separator)] p-1.5 align-top ${dia.doMes ? "" : "bg-[var(--ds-surface-2)]"}`}>
      <p
        className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums ${
          dia.hoje ? "bg-[var(--ds-brand)] text-white" : dia.doMes ? "text-[var(--ds-label)]" : "text-[var(--ds-label-2)]"
        }`}
      >
        {Number(dia.data.slice(8, 10))}
      </p>
      <div className="flex flex-col gap-1">
        {dia.eventos.map((evento) => (
          <CartaoDoEvento key={evento.id} evento={evento} dia={dia.data} />
        ))}
        {dia.masterclasses.length > 0 && (
          <details className="group rounded-[7px] text-[12px]">
            <summary className="rounded-[7px] px-1.5 py-0.5 font-medium text-[var(--ds-label-2)] hover:bg-[var(--ds-fill-4)]">
              {resumoDasMasterclasses(ativas, canceladas)}
            </summary>
            <div className="mt-1 flex flex-col gap-1">
              {dia.masterclasses.map((mc) => (
                <CartaoDoEvento key={mc.id} evento={mc} dia={dia.data} />
              ))}
            </div>
          </details>
        )}
      </div>
    </td>
  );
}

function exemplosDaPendencia(eventos: EventoNoCalendario[]): ExemploDePendencia[] {
  return eventos.map((evento) => ({
    chave: evento.id,
    href: `/eventos/${evento.id}`,
    rotulo: (
      <>
        {rotuloCurto(evento)}
        {evento.poloCodigo && <span className="text-[var(--ds-label-2)]"> · {evento.poloCodigo}</span>}
      </>
    ),
    detalhe: diaEMes(evento.dataInicio),
  }));
}

export default async function PaginaCalendario({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const calendario = await carregarCalendario(await repositorioCalendario(), {
    ...parametros,
    agora: new Date(),
  });
  const { filtros, resumo, pendencias } = calendario;

  return (
    <>
      <CabecalhoDaPagina titulo="Calendário" subtitulo={quandoSincronizou(calendario.ultimaSincronizacao)} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoDeNumero rotulo="Eventos no mês" valor={resumo.eventos} />
        <CartaoDeNumero rotulo="Masterclasses no mês" valor={resumo.masterclasses} />
        <CartaoDeNumero rotulo="Vagas sugeridas" valor={resumo.vagas} />
        <CartaoDeNumero rotulo="Escalas aprovadas" valor={resumo.escalasAprovadas} de={resumo.eventos} />
      </div>

      <section className="mb-5" aria-labelledby="precisa-de-acao">
        <h2 id="precisa-de-acao" className="mb-3 text-[17px] font-semibold tracking-[-0.01em]">
          Precisa de ação
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <CartaoDePendencia
            titulo="Escalas a montar"
            explicacao={`Eventos nos próximos ${DIAS_PARA_MONTAR_ESCALA} dias com a escala ainda não aprovada.`}
            exemplos={exemplosDaPendencia(pendencias.escalasAMontar)}
          />
          <CartaoDePendencia
            titulo="Confronto sem fila"
            explicacao="Sem o número de pessoas na fila, as vagas de pai e mãe não são calculadas."
            exemplos={exemplosDaPendencia(pendencias.confrontoSemFila)}
          />
          <CartaoDePendencia
            titulo="Eventos sem código"
            explicacao="Falta a edição ou o polo no IAM Control, ou outro evento ativo usa o mesmo código."
            exemplos={exemplosDaPendencia(pendencias.semCodigo)}
          />
        </div>
      </section>

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

        <div className="overflow-x-auto">
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
            <tbody>
              {calendario.semanas.map((semana) => (
                <tr key={semana[0]!.data}>
                  {semana.map((dia) => (
                    <Dia key={dia.data} dia={dia} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-[var(--ds-label-2)]">Clique num evento para abrir. Passe o mouse ou o foco do teclado para ver código, período, público e vagas.</p>
      </section>
    </>
  );
}
