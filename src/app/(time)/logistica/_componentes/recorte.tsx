import Link from "next/link";

// "Eventos | Masterclass": o recorte das telas de Voos e de Hospedagem (e das da SDC), como a planilha separa em abas.
// Fica na URL (?recorte=masterclass); sem o parâmetro, vale Eventos.

export type Recorte = "EVENTOS" | "MASTERCLASS";

const ROTULOS: Record<Recorte, string> = { EVENTOS: "Eventos", MASTERCLASS: "Masterclass" };
const ITEM = "inline-flex h-8 items-center rounded-[8px] px-3 text-[13px] font-medium";

export function AtalhosDoRecorte({ recorte, href, quantidades }: { recorte: Recorte; /** Endereço da tela em cada recorte. */ href: (recorte: Recorte) => string; quantidades?: Record<Recorte, number> }) {
  return (
    <nav aria-label="Eventos ou Masterclass" className="mb-4">
      <ul className="inline-flex flex-wrap gap-0.5 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] p-0.5">
        {(["EVENTOS", "MASTERCLASS"] as const).map((opcao) => (
          <li key={opcao}>
            <Link
              href={href(opcao)}
              scroll={false}
              aria-current={opcao === recorte ? "page" : undefined}
              className={`${ITEM} ${opcao === recorte ? "bg-[var(--ds-brand)] text-white" : "text-[var(--ds-label)] hover:bg-[var(--ds-fill-4)]"}`}
            >
              {ROTULOS[opcao]}
              {quantidades && <span className="ml-1 tabular-nums opacity-80">({quantidades[opcao]})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
