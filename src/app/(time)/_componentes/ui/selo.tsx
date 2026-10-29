import { UserPen } from "lucide-react";

import { dataEHora } from "./formatos";

/**
 * Marca o que o time registrou em nome de staff, SDC ou financeiro (coluna registrado_por preenchida).
 * Fica ao lado do status registrado. A descrição vai no title e em sr-only.
 */
export function SeloRegistradoPeloTime({ em, por }: { em?: Date | string | null; por?: string | null }) {
  const descricao = ["Registrado pelo time", em ? `em ${dataEHora(em)}` : null].filter(Boolean).join(" ") + `, em nome da pessoa${por ? `, por ${por}` : ""}.`;
  return (
    <span
      title={descricao}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-separator)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ds-label-2)]"
    >
      <UserPen size={12} aria-hidden />
      <span aria-hidden>Registrado pelo time</span>
      <span className="sr-only">{descricao}</span>
    </span>
  );
}
