"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { type ItemDaMigalha, Migalha } from "./cabecalho";

export type AbaDaPagina = {
  href: string;
  rotulo: string;
  /** Ativa só no endereço exato (a aba "Resumo" do evento). As outras valem também para as subrotas. */
  exata?: boolean;
  /** Contador ou ponto de atenção ao lado do rótulo ("18 de 22", "3 bloqueadas"). */
  contador?: string;
  atencao?: boolean;
  /** Nome completo para leitor de tela quando há contador ("Comunicação · 3 bloqueadas"). */
  rotuloAcessivel?: string;
};

export function abaAtiva(abas: AbaDaPagina[], caminho: string): AbaDaPagina | undefined {
  return abas.find((aba) => (aba.exata ? caminho === aba.href : caminho === aba.href || caminho.startsWith(`${aba.href}/`)));
}

/** Abas como links para rotas (não role="tablist"), logo abaixo do cabeçalho (doc 08 §3.8). */
export function AbasDaPagina({ rotulo, abas }: { rotulo: string; abas: AbaDaPagina[] }) {
  const ativa = abaAtiva(abas, usePathname());
  return (
    <nav aria-label={rotulo} className="mb-5 overflow-x-auto">
      <ul className="flex gap-1 border-b border-[var(--ds-separator)]">
        {abas.map((aba) => {
          const atual = aba === ativa;
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                aria-current={atual ? "page" : undefined}
                aria-label={aba.rotuloAcessivel}
                className={`relative -mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap px-3 text-[14px] font-medium ${
                  atual
                    ? "border-b-2 border-[var(--ds-brand)] text-[var(--ds-tint-text)]"
                    : "text-[var(--ds-label-2)] hover:text-[var(--ds-label)]"
                }`}
              >
                {aba.rotulo}
                {aba.contador && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[12px] tabular-nums ${
                      aba.atencao ? "bg-[var(--ds-orange-soft)] text-[var(--ds-orange-deep)]" : "bg-[var(--ds-fill-4)] text-[var(--ds-label-2)]"
                    }`}
                  >
                    {aba.contador}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Migalha dos layouts com abas: acrescenta a aba atual no fim (`Calendário › CONF_AM_60 › Escala`). */
export function MigalhaDaSecao({ itens, abas }: { itens: ItemDaMigalha[]; abas: AbaDaPagina[] }) {
  const ativa = abaAtiva(abas, usePathname());
  const comSecao = ativa && !ativa.exata ? [...itens.slice(0, -1), { ...itens.at(-1)!, href: abas.find((aba) => aba.exata)?.href }, { rotulo: ativa.rotulo }] : itens;
  return <Migalha itens={comSecao} />;
}
