"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ProvedorDeToast } from "@/app/(time)/_componentes/ui/toast";

const ABAS = [
  { href: "/sdc/voos", rotulo: "Voos" },
  { href: "/sdc/hospedagem", rotulo: "Hospedagem" },
];

/**
 * A moldura da área da SDC: só "Voos", "Hospedagem" e sair. Sem o menu do time e sem nenhum link para dentro do
 * sistema. `sair` é a server action de sempre (encerra a sessão).
 */
export function MolduraDaSdc({ nome, email, sair, children }: { nome: string; email: string; sair: () => Promise<void>; children: ReactNode }) {
  const caminho = usePathname();
  return (
    <div data-ds="" className="min-h-screen">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-[10px] focus:bg-[var(--ds-surface)] focus:px-4 focus:py-2 focus:text-[14px] focus:font-semibold focus:text-[var(--ds-tint-text)] focus:shadow-[var(--ds-shadow-3)]"
      >
        Pular para o conteúdo
      </a>
      <header className="app-header sticky top-0 z-30 px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-[15px] font-semibold">Eventos IAM · SDC</p>
          <nav aria-label="Seções da SDC" className="order-3 w-full sm:order-none sm:w-auto">
            <ul className="flex gap-1">
              {ABAS.map((aba) => {
                const atual = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
                return (
                  <li key={aba.href}>
                    <Link
                      href={aba.href}
                      aria-current={atual ? "page" : undefined}
                      className={`inline-flex h-10 items-center rounded-[10px] px-3 text-[14px] font-medium ${
                        atual ? "bg-[var(--ds-tint-soft)] text-[var(--ds-tint-text)]" : "text-[var(--ds-label-2)] hover:text-[var(--ds-label)]"
                      }`}
                    >
                      {aba.rotulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <p className="hidden text-right text-[12px] leading-tight text-[var(--ds-label-2)] sm:block">
              <span className="block text-[13px] text-[var(--ds-label)]">{nome}</span>
              {email}
            </p>
            <form action={sair}>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3 text-[14px] font-medium text-[var(--ds-label)] hover:bg-[var(--ds-surface-2)]"
                aria-label={`Sair (${nome})`}
              >
                <LogOut size={18} aria-hidden />
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <ProvedorDeToast>
        <main id="conteudo" tabIndex={-1} className="mx-auto max-w-[1100px] px-4 py-5 outline-none md:px-6 md:py-6">
          {children}
        </main>
      </ProvedorDeToast>
    </div>
  );
}
