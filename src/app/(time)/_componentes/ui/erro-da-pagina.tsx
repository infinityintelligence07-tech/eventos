"use client";

import { classesDoBotao } from "./classes";

/** Conteúdo do error.tsx de cada rota (padrão de calendario/error.tsx). */
export function ErroDaPagina({ tela, aoTentarDeNovo }: { tela: string; aoTentarDeNovo: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] p-6 shadow-[var(--ds-shadow-1)]">
      <h1 className="text-[20px] font-semibold">Não foi possível carregar {tela}</h1>
      <p className="mt-1 text-[14px] text-[var(--ds-label-2)]">Tente de novo. Se continuar, o banco de dados pode estar fora do ar.</p>
      <button type="button" onClick={aoTentarDeNovo} className={`${classesDoBotao({ variante: "primario" })} mt-4`}>
        Tentar de novo
      </button>
    </div>
  );
}
