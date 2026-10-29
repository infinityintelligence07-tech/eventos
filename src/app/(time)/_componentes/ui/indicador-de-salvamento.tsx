"use client";

import { Check, LoaderCircle } from "lucide-react";

import { hora } from "./formatos";

export type EstadoDoSalvamento = { situacao: "ocioso" } | { situacao: "salvando" } | { situacao: "salvo"; em: Date } | { situacao: "erro" };

/** Telas que salvam sozinhas (doc 08 §3.12): "Salvando…" → "Salvo às 14:32" → erro com "Tentar de novo". */
export function IndicadorDeSalvamento({ estado, aoTentarDeNovo }: { estado: EstadoDoSalvamento; aoTentarDeNovo?: () => void }) {
  return (
    <p role="status" aria-live="polite" className="inline-flex min-h-6 items-center gap-1 text-[12px] text-[var(--ds-label-2)]">
      {(() => {
        switch (estado.situacao) {
          case "ocioso":
            return null;
          case "salvando":
            return (
              <>
                <LoaderCircle size={14} aria-hidden className="animate-spin motion-reduce:animate-none" />
                Salvando…
              </>
            );
          case "salvo":
            return (
              <>
                <Check size={14} aria-hidden />
                Salvo às {hora(estado.em)}
              </>
            );
          case "erro":
            return (
              <span className="font-medium text-[var(--ds-red-deep)]">
                Não foi possível salvar.
                {aoTentarDeNovo && (
                  <button type="button" onClick={aoTentarDeNovo} className="ml-1 underline">
                    Tentar de novo
                  </button>
                )}
              </span>
            );
          default: {
            const desconhecido: never = estado;
            throw new Error(`estado de salvamento desconhecido: ${JSON.stringify(desconhecido)}`);
          }
        }
      })()}
    </p>
  );
}
