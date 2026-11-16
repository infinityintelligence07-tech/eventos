import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página não encontrada" };

// Endereço que não existe em nenhuma rota. As telas do time têm o próprio "não encontrado" (evento, pessoa, enquete).
export default function PaginaNaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-start justify-center gap-3 px-6 py-10">
      <p className="text-[13px] font-medium text-[var(--ds-label-2)]">Erro 404</p>
      <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-0.02em]">Página não encontrada</h1>
      <p className="text-[15px] text-[var(--ds-label-2)]">O endereço pode ter sido digitado errado ou a página mudou de lugar.</p>
      <Link
        href="/inicio"
        className="mt-2 inline-flex h-10 items-center rounded-[10px] bg-[var(--ds-brand)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--ds-tint-deep)]"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
