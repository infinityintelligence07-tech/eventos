"use client";

export default function ErroNoCalendario({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] p-6 shadow-[var(--ds-shadow-1)]">
      <h1 className="text-[20px] font-semibold">Não foi possível carregar o calendário</h1>
      <p className="mt-1 text-[14px] text-[var(--ds-label-2)]">
        Tente de novo. Se continuar, o banco de dados pode estar fora do ar.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 h-10 rounded-[10px] bg-[var(--ds-brand)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--ds-tint-deep)]"
      >
        Tentar de novo
      </button>
    </div>
  );
}
