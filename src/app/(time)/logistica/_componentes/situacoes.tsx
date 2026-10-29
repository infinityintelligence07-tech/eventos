import { Ban, CircleDashed, PlaneTakeoff, RefreshCw, Send } from "lucide-react";

import { rotuloDaSituacaoDoVoo, type SituacaoDoVoo } from "@/modules/logistica";

import { Chip } from "../../_componentes/ui/situacao";

/** Chip do pedido de voo (doc 08 §13). */
export function ChipDoVoo({ situacao }: { situacao: SituacaoDoVoo }) {
  const rotulo = rotuloDaSituacaoDoVoo(situacao);
  switch (situacao) {
    case "A_PEDIR":
      return (
        <Chip tom="neutro" icone={<CircleDashed size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "PEDIDO":
      return (
        <Chip tom="informacao" icone={<Send size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "EMITIDO":
      return (
        <Chip tom="sucesso" icone={<PlaneTakeoff size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "ALTERADO":
      return (
        <Chip tom="atencao" icone={<RefreshCw size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "CANCELADO":
      return (
        <Chip tom="neutro" riscado icone={<Ban size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Monta o endereço com os parâmetros atuais trocados (nulo remove). */
export function enderecoCom(base: string, atuais: Record<string, string | undefined>, mudancas: Record<string, string | null>): string {
  const parametros = new URLSearchParams();
  for (const [nome, valor] of Object.entries({ ...atuais, ...mudancas })) {
    if (valor) parametros.set(nome, valor);
  }
  const texto = parametros.toString();
  return texto ? `${base}?${texto}` : base;
}

/** Valor de um campo datetime-local na hora de São Paulo ("2026-11-05T08:10"). */
export function paraCampoDeDataEHora(instante: Date | null): string {
  if (!instante) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}T${parte("hour")}:${parte("minute")}`;
}

/** Centavos no formato que o campo de dinheiro aceita ("1.234,56"). */
export function paraCampoDeDinheiro(centavos: number | null): string {
  return centavos === null ? "" : (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Primeiro valor de um searchParam do Next. */
export function parametro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}
