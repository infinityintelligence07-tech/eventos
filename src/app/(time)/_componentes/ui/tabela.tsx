import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { CARTAO } from "./classes";

// doc 08 §3.5. A linha que abre algo tem o link no texto da primeira coluna (nada de onClick no <tr>).

/** Tabela dentro de cartão; rola na horizontal dentro do cartão, nunca a página. */
export function Tabela({
  legenda,
  larguraMinima = "min-w-[880px]",
  rodape,
  children,
}: {
  /** Vai no <caption> (só leitor de tela). */
  legenda: string;
  larguraMinima?: string;
  /** Ex.: `<RodapeDaTabela … />`, fora da rolagem. */
  rodape?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${CARTAO} min-w-0 p-0`}>
      {/* relative: sem ele, o caption e os textos sr-only (position: absolute) escapam da rolagem e alargam a página. */}
      <div className="relative overflow-x-auto">
        <table className={`w-full ${larguraMinima} border-collapse text-[14px]`}>
          <caption className="sr-only">{legenda}</caption>
          {children}
        </table>
      </div>
      {rodape}
    </section>
  );
}

export function CabecaDaTabela({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--ds-surface-1)]">
      <tr>{children}</tr>
    </thead>
  );
}

/** Cabeçalho de coluna. `numero` alinha à direita (dinheiro, km, quantidades). */
export function ColunaDaTabela({ numero = false, className = "", children, ...resto }: ThHTMLAttributes<HTMLTableCellElement> & { numero?: boolean }) {
  return (
    <th scope="col" {...resto} className={`px-4 py-2.5 text-[12px] font-medium text-[var(--ds-label-2)] ${numero ? "text-right" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function LinhaDaTabela({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`border-t border-[var(--ds-separator)] hover:bg-[var(--ds-surface-1)] ${className}`}>{children}</tr>;
}

const FIXA = "sticky left-0 z-10 bg-[var(--ds-surface)]";

/** Célula. `cabecalhoDaLinha` vira <th scope="row">; `fixa` prende a primeira coluna nas tabelas largas. */
export function CelulaDaTabela({
  numero = false,
  cabecalhoDaLinha = false,
  fixa = false,
  className = "",
  children,
  ...resto
}: TdHTMLAttributes<HTMLTableCellElement> & { numero?: boolean; cabecalhoDaLinha?: boolean; fixa?: boolean }) {
  const classes = `px-4 py-3 align-middle ${numero ? "text-right tabular-nums" : "text-left"} ${fixa ? FIXA : ""} ${className}`;
  if (cabecalhoDaLinha) {
    return (
      <th scope="row" {...(resto as ThHTMLAttributes<HTMLTableCellElement>)} className={`${classes} font-medium`}>
        {children}
      </th>
    );
  }
  return (
    <td {...resto} className={classes}>
      {children}
    </td>
  );
}

/** Rodapé "Mostrando 50 de 312" + ação "Mostrar mais 50" (sem paginação numerada). */
export function RodapeDaTabela({ mostrando, total, children }: { mostrando: number; total: number; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ds-separator)] px-4 py-3 text-[13px] text-[var(--ds-label-2)]">
      <span>
        Mostrando {mostrando.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
      </span>
      {children}
    </div>
  );
}
