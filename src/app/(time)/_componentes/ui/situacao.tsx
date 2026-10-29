import {
  BadgeCheck,
  Ban,
  CircleCheckBig,
  CircleDashed,
  Hourglass,
  type LucideIcon,
  PencilLine,
  Send,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";

import type { SituacaoNoCalendario } from "@/modules/eventos";

// doc 08 §3.4 e §13. Situação da escala do evento usa as classes .situacao-* (mesmas cores do Calendário);
// todo o resto (convocação, copy, auditoria, enquete) usa o Chip de tom.

export function rotuloDaSituacao(situacao: SituacaoNoCalendario): string {
  switch (situacao) {
    case "SEM_ESCALA":
      return "Sem escala";
    case "RASCUNHO":
      return "Escala em rascunho";
    case "AGUARDANDO_APROVACAO":
      return "Aguardando aprovação";
    case "DEVOLVIDA":
      return "Devolvida";
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

export function iconeDaSituacao(situacao: SituacaoNoCalendario): LucideIcon {
  switch (situacao) {
    case "SEM_ESCALA":
      return CircleDashed;
    case "RASCUNHO":
      return PencilLine;
    case "AGUARDANDO_APROVACAO":
      return Hourglass;
    case "DEVOLVIDA":
      return Undo2;
    case "APROVADA":
      return BadgeCheck;
    case "COMUNICADA":
      return Send;
    case "CANCELADO":
      return Ban;
    case "CONCLUIDO":
      return CircleCheckBig;
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** Chip da situação da escala do evento (classe situacao-*, borda à esquerda). */
export function ChipDaEscala({ situacao }: { situacao: SituacaoNoCalendario }) {
  const Icone = iconeDaSituacao(situacao);
  return (
    <span className={`situacao-${situacao} inline-flex items-center gap-1 rounded-[7px] border border-l-[3px] px-2 py-0.5 text-[12px] font-medium`}>
      <Icone size={14} aria-hidden />
      {rotuloDaSituacao(situacao)}
    </span>
  );
}

export type TomDoChip = "neutro" | "informacao" | "sucesso" | "atencao" | "perigo";

// Os tons *-soft são translúcidos: sobre uma linha selecionada (tint-soft) o texto caía abaixo de 4,5:1.
// O fundo opaco (surface + o tom por cima) mantém o mesmo tom do token e o contraste em qualquer fundo.
function classesDoTom(tom: TomDoChip): string {
  switch (tom) {
    case "neutro":
      return "bg-[var(--ds-surface)] [background-image:linear-gradient(var(--ds-fill-4),var(--ds-fill-4))] text-[var(--ds-label-2)]";
    case "informacao":
      return "bg-[var(--ds-surface)] [background-image:linear-gradient(var(--ds-tint-soft),var(--ds-tint-soft))] text-[var(--ds-tint-text)]";
    case "sucesso":
      return "bg-[var(--ds-surface)] [background-image:linear-gradient(var(--ds-green-soft),var(--ds-green-soft))] text-[var(--ds-green-deep)]";
    case "atencao":
      return "bg-[var(--ds-surface)] [background-image:linear-gradient(var(--ds-orange-soft),var(--ds-orange-soft))] text-[var(--ds-orange-deep)]";
    case "perigo":
      return "bg-[var(--ds-surface)] [background-image:linear-gradient(var(--ds-red-soft),var(--ds-red-soft))] text-[var(--ds-red-deep)]";
    default: {
      const desconhecido: never = tom;
      throw new Error(`tom desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Pílula de status: sempre ícone (14 px, aria-hidden) + texto. O mapeamento de cada status está na doc 08 §13. */
export function Chip({ tom, icone, riscado = false, children }: { tom: TomDoChip; icone?: ReactNode; riscado?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${classesDoTom(tom)} ${riscado ? "line-through" : ""}`}>
      {icone}
      {children}
    </span>
  );
}
