import Link from "next/link";

import { type EventoNoCalendario, type SituacaoNoCalendario, situacaoNoCalendario } from "@/modules/eventos";

import { rotuloDaSituacao } from "../../_componentes/ui/situacao";

export function diaEMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export function periodo(evento: Pick<EventoNoCalendario, "dataInicio" | "dataFim">): string {
  return evento.dataInicio === evento.dataFim
    ? diaEMes(evento.dataInicio)
    : `${diaEMes(evento.dataInicio)} a ${diaEMes(evento.dataFim)}`;
}

/** "Confronto 60" para eventos; a cidade para Masterclass. */
export function rotuloCurto(evento: EventoNoCalendario): string {
  if (evento.tipoSigla === "MC") return evento.nome.replace(/^Masterclass · /, "");
  return [evento.tipoNome, evento.edicao].filter(Boolean).join(" ");
}

function detalhes(evento: EventoNoCalendario, situacao: SituacaoNoCalendario): string {
  return [
    evento.nome,
    evento.codigo ? `Código: ${evento.codigo}` : "Sem código",
    `Período: ${periodo(evento)}`,
    rotuloDaSituacao(situacao),
    evento.expectativaPublico !== null ? `Público esperado: ${evento.expectativaPublico}` : null,
    evento.tipoSigla === "CONF" ? `Pessoas na fila: ${evento.pessoasNaFila ?? "não informado"}` : null,
    `Vagas sugeridas: ${evento.vagas}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function CartaoDoEvento({ evento, dia }: { evento: EventoNoCalendario; dia: string }) {
  const situacao = situacaoNoCalendario(evento);
  const primeiroDia = evento.dataInicio === dia;
  const informacoes = [
    evento.poloCodigo,
    primeiroDia && evento.expectativaPublico !== null ? `${evento.expectativaPublico} pessoas` : null,
    primeiroDia && evento.vagas > 0 ? `${evento.vagas} vagas` : null,
  ].filter(Boolean);
  const texto = detalhes(evento, situacao);
  // O mesmo evento aparece em vários dias: o id da descrição leva o dia.
  const idDosDetalhes = `evento-${evento.id}-${dia}`;

  return (
    <>
      <Link
        href={`/eventos/${evento.id}`}
        title={texto}
        aria-describedby={idDosDetalhes}
        className={`situacao-${situacao} block rounded-[7px] border border-l-[3px] px-2 py-1 text-[12px] leading-[1.35]`}
      >
        <span className="block font-semibold">{rotuloCurto(evento)}</span>
        {informacoes.length > 0 && <span className="block opacity-80">{informacoes.join(" · ")}</span>}
      </Link>
      <span id={idDosDetalhes} className="sr-only">
        {texto.replace(/\n/g, ". ")}
      </span>
    </>
  );
}
