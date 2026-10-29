import Link from "next/link";
import type { ReactNode } from "react";

import { CARTAO, EXPLICACAO_DE_CARTAO, TITULO_DE_CARTAO } from "./classes";

const ESPACAMENTO = {
  padrao: "p-5",
  numero: "px-5 py-4",
  tabela: "p-4 md:p-5",
  nenhum: "p-0",
} as const;

/**
 * Cartão da doc 08 §3.2. Com `titulo`, vira uma `section` rotulada pelo h3 (passe `id` para o aria-labelledby).
 * Cartão clicável: ponha o Link no título, não no cartão inteiro.
 */
export function Cartao({
  id,
  titulo,
  explicacao,
  acoes,
  espacamento = "padrao",
  como = "section",
  className = "",
  children,
}: {
  id?: string;
  titulo?: ReactNode;
  explicacao?: ReactNode;
  acoes?: ReactNode;
  espacamento?: keyof typeof ESPACAMENTO;
  como?: "section" | "article" | "div";
  className?: string;
  children?: ReactNode;
}) {
  const Elemento = como;
  const idDoTitulo = id ? `${id}-titulo` : undefined;
  return (
    <Elemento id={id} aria-labelledby={titulo ? idDoTitulo : undefined} className={`${CARTAO} min-w-0 ${ESPACAMENTO[espacamento]} ${className}`}>
      {(titulo || acoes) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {titulo && (
              <h3 id={idDoTitulo} className={TITULO_DE_CARTAO}>
                {titulo}
              </h3>
            )}
            {explicacao && <p className={EXPLICACAO_DE_CARTAO}>{explicacao}</p>}
          </div>
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
      )}
      {children}
    </Elemento>
  );
}

/** Número grande com rótulo (o "Numero" do Calendário). Com `href`, o rótulo vira atalho para a lista. */
export function CartaoDeNumero({ rotulo, valor, de, href }: { rotulo: string; valor: number; de?: number; href?: string }) {
  return (
    <div className={`${CARTAO} px-5 py-4`}>
      <p className="text-[12px] font-medium tracking-[0.012em] text-[var(--ds-label-2)]">
        {href ? (
          <Link href={href} className="hover:text-[var(--ds-label)] hover:underline">
            {rotulo}
          </Link>
        ) : (
          rotulo
        )}
      </p>
      <p className="mt-1 text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] tabular-nums">
        {valor.toLocaleString("pt-BR")}
        {de !== undefined && <span className="text-[17px] font-medium text-[var(--ds-label-2)]"> de {de.toLocaleString("pt-BR")}</span>}
      </p>
    </div>
  );
}

/** Mesmo formato do `ItemDoInicio` (docs/07 §7.3). */
export type ExemploDePendencia = { chave: string; rotulo: ReactNode; detalhe?: ReactNode; href?: string };

/** Pendência com contador (laranja > 0, verde = 0), explicação, até `limite` itens e "e mais N". */
export function CartaoDePendencia({
  titulo,
  explicacao,
  exemplos,
  quantidade = exemplos.length,
  href,
  rotuloVerTodos = "Ver todos",
  textoSemPendencia,
  limite = 6,
}: {
  titulo: string;
  explicacao: string;
  exemplos: ExemploDePendencia[];
  quantidade?: number;
  /** Lista completa; aparece como "Ver todos" quando há pendência. */
  href?: string;
  rotuloVerTodos?: string;
  /** Ex.: "Nada pendente." (o Início mostra; o Calendário não). */
  textoSemPendencia?: string;
  limite?: number;
}) {
  const restantes = quantidade - Math.min(exemplos.length, limite);
  return (
    <section className={`${CARTAO} p-5`}>
      <h3 className={`flex items-center justify-between gap-2 ${TITULO_DE_CARTAO}`}>
        {titulo}
        <span
          className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
            quantidade > 0 ? "bg-[var(--ds-orange-soft)] text-[var(--ds-orange-deep)]" : "bg-[var(--ds-green-soft)] text-[var(--ds-green-deep)]"
          }`}
        >
          {quantidade}
          <span className="sr-only">{quantidade === 1 ? " pendência" : " pendências"}</span>
        </span>
      </h3>
      <p className={EXPLICACAO_DE_CARTAO}>{explicacao}</p>
      {quantidade === 0 && textoSemPendencia && <p className="mt-2 text-[13px] text-[var(--ds-label-2)]">{textoSemPendencia}</p>}
      {exemplos.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[13px]">
          {exemplos.slice(0, limite).map((exemplo) => (
            <li key={exemplo.chave} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="min-w-0">
                {exemplo.href ? (
                  <Link href={exemplo.href} className="text-[var(--ds-tint-text)] hover:underline">
                    {exemplo.rotulo}
                  </Link>
                ) : (
                  exemplo.rotulo
                )}
              </span>
              {/* Sem reticências (regra do design-system.css): detalhe longo desce para a linha de baixo. */}
              {exemplo.detalhe && <span className="min-w-0 tabular-nums text-[var(--ds-label-2)]">{exemplo.detalhe}</span>}
            </li>
          ))}
          {restantes > 0 && <li className="text-[12px] text-[var(--ds-label-2)]">e mais {restantes}</li>}
        </ul>
      )}
      {href && quantidade > 0 && (
        <Link href={href} className="mt-2 inline-flex text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline">
          {rotuloVerTodos}
        </Link>
      )}
    </section>
  );
}
