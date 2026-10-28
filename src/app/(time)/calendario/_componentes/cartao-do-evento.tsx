import { type EventoNoCalendario, type SituacaoNoCalendario, situacaoNoCalendario } from "@/modules/eventos";

export function rotuloDaSituacao(situacao: SituacaoNoCalendario): string {
  switch (situacao) {
    case "SEM_ESCALA":
      return "Sem escala";
    case "RASCUNHO":
      return "Escala em rascunho";
    case "APROVADA":
      return "Escala aprovada";
    case "COMUNICADA":
      return "Escala comunicada";
    case "CANCELADO":
      return "Cancelado";
    case "CONCLUIDO":
      return "Concluído";
    default: {
      const desconhecida: never = situacao;
      return desconhecida;
    }
  }
}

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

  return (
    <div className={`situacao-${situacao} rounded-[7px] border border-l-[3px] px-2 py-1 text-[12px] leading-[1.35]`} title={detalhes(evento, situacao)}>
      <p className="font-semibold">{rotuloCurto(evento)}</p>
      {informacoes.length > 0 && <p className="opacity-80">{informacoes.join(" · ")}</p>}
    </div>
  );
}
