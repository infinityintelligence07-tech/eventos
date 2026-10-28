import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  type Calendario,
  carregarCalendario,
  type DiaDoCalendario,
  DIAS_PARA_MONTAR_ESCALA,
  type EventoNoCalendario,
  repositorioCalendario,
  type SituacaoNoCalendario,
} from "@/modules/eventos";

import { CartaoDoEvento, diaEMes, rotuloCurto, rotuloDaSituacao } from "./_componentes/cartao-do-evento";
import { Filtros } from "./_componentes/filtros";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendário" };

type Parametros = { mes?: string; polo?: string; tipo?: string };

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LEGENDA: SituacaoNoCalendario[] = ["SEM_ESCALA", "RASCUNHO", "APROVADA", "COMUNICADA", "CANCELADO"];
const CARTAO = "rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-1)]";
const BOTAO =
  "inline-flex h-10 items-center justify-center rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3 text-[14px] font-medium text-[var(--ds-label)] hover:bg-[var(--ds-surface-2)]";

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

function Numero({ valor, rotulo, de }: { valor: number; rotulo: string; de?: number }) {
  return (
    <div className={`${CARTAO} px-5 py-4`}>
      <p className="text-[12px] font-medium tracking-[0.012em] text-[var(--ds-label-2)]">{rotulo}</p>
      <p className="mt-1 text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] tabular-nums">
        {valor.toLocaleString("pt-BR")}
        {de !== undefined && <span className="text-[17px] font-medium text-[var(--ds-label-2)]"> de {de.toLocaleString("pt-BR")}</span>}
      </p>
    </div>
  );
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
          dia.hoje ? "bg-[var(--ds-brand)] text-white" : dia.doMes ? "text-[var(--ds-label)]" : "text-[var(--ds-label-3)]"
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

function Pendencia({ titulo, explicacao, eventos }: { titulo: string; explicacao: string; eventos: EventoNoCalendario[] }) {
  const LIMITE = 6;
  return (
    <section className={`${CARTAO} p-5`}>
      <h3 className="flex items-center justify-between gap-2 text-[15px] font-semibold">
        {titulo}
        <span
          className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
            eventos.length > 0 ? "bg-[var(--ds-orange-soft)] text-[var(--ds-orange-deep)]" : "bg-[var(--ds-green-soft)] text-[var(--ds-green-deep)]"
          }`}
        >
          {eventos.length}
        </span>
      </h3>
      <p className="mt-0.5 text-[12px] text-[var(--ds-label-2)]">{explicacao}</p>
      {eventos.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[13px]">
          {eventos.slice(0, LIMITE).map((evento) => (
            <li key={evento.id} className="flex justify-between gap-2">
              <span>
                {rotuloCurto(evento)}
                {evento.poloCodigo && <span className="text-[var(--ds-label-2)]"> · {evento.poloCodigo}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--ds-label-2)]">{diaEMes(evento.dataInicio)}</span>
            </li>
          ))}
          {eventos.length > LIMITE && <li className="text-[12px] text-[var(--ds-label-2)]">e mais {eventos.length - LIMITE}</li>}
        </ul>
      )}
    </section>
  );
}

function Cabecalho({ children, subtitulo }: { children: ReactNode; subtitulo: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-0.02em]">{children}</h1>
      <p className="mt-1 text-[14px] text-[var(--ds-label-2)]">{subtitulo}</p>
    </div>
  );
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
      <Cabecalho subtitulo={quandoSincronizou(calendario.ultimaSincronizacao)}>Calendário</Cabecalho>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Eventos no mês" valor={resumo.eventos} />
        <Numero rotulo="Masterclasses no mês" valor={resumo.masterclasses} />
        <Numero rotulo="Vagas sugeridas" valor={resumo.vagas} />
        <Numero rotulo="Escalas aprovadas" valor={resumo.escalasAprovadas} de={resumo.eventos} />
      </div>

      <section className="mb-5" aria-labelledby="precisa-de-acao">
        <h2 id="precisa-de-acao" className="mb-3 text-[17px] font-semibold tracking-[-0.01em]">
          Precisa de ação
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Pendencia
            titulo="Escalas a montar"
            explicacao={`Eventos nos próximos ${DIAS_PARA_MONTAR_ESCALA} dias com a escala ainda não aprovada.`}
            eventos={pendencias.escalasAMontar}
          />
          <Pendencia
            titulo="Confronto sem fila"
            explicacao="Sem o número de pessoas na fila, as vagas de pai e mãe não são calculadas."
            eventos={pendencias.confrontoSemFila}
          />
          <Pendencia
            titulo="Eventos sem código"
            explicacao="Falta a edição ou o polo no IAM Control, ou outro evento ativo usa o mesmo código."
            eventos={pendencias.semCodigo}
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
            <li key={situacao} className={`situacao-${situacao} rounded-[7px] border border-l-[3px] px-2 py-0.5 font-medium`}>
              {rotuloDaSituacao(situacao)}
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
        <p className="mt-3 text-[12px] text-[var(--ds-label-2)]">Passe o mouse sobre um evento para ver código, período, público e vagas.</p>
      </section>
    </>
  );
}
