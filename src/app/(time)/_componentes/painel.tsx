"use client";

import {
  CalendarCheck,
  CalendarDays,
  Contact,
  House,
  Menu,
  MessageCircle,
  Moon,
  Plane,
  Receipt,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

type ItemDoMenu = { nome: string; icone: ReactNode; href?: string };

const ICONE = { size: 20, className: "shrink-0" };

const MENU: ItemDoMenu[] = [
  { nome: "Início", icone: <House {...ICONE} /> },
  { nome: "Calendário", icone: <CalendarDays {...ICONE} />, href: "/calendario" },
  { nome: "Escalas", icone: <Users {...ICONE} /> },
  { nome: "Comunicação", icone: <MessageCircle {...ICONE} /> },
  { nome: "Disponibilidade", icone: <CalendarCheck {...ICONE} /> },
  { nome: "Pessoas", icone: <Contact {...ICONE} /> },
  { nome: "Logística e SDC", icone: <Plane {...ICONE} /> },
  { nome: "Custos", icone: <Receipt {...ICONE} /> },
  { nome: "Configurações", icone: <Settings {...ICONE} /> },
];

function BarraLateral({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const caminho = usePathname();
  return (
    <aside
      className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col px-4 transition-transform duration-200 lg:translate-x-0 ${
        aberta ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between pt-6 pb-2">
        <Link href="/calendario" className="flex items-center gap-3" onClick={aoFechar}>
          <Image src="/images/logo/logo-branco.svg" alt="IAM" width={74} height={30} className="h-7 w-auto" priority />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Eventos</span>
        </Link>
        <button type="button" className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden" onClick={aoFechar} aria-label="Fechar menu">
          <X size={20} />
        </button>
      </div>
      <nav className="mt-6 flex-1 overflow-y-auto" aria-label="Menu principal">
        <h2 className="mb-3 text-[12px] font-medium tracking-[0.012em] text-white/55">Time de eventos</h2>
        <ul className="flex flex-col gap-1">
          {MENU.map((item) => (
            <li key={item.nome}>
              {item.href ? (
                <Link
                  href={item.href}
                  onClick={aoFechar}
                  aria-current={caminho.startsWith(item.href) ? "page" : undefined}
                  className={`menu-item ${caminho.startsWith(item.href) ? "menu-item-active" : "menu-item-inactive"}`}
                >
                  {item.icone}
                  {item.nome}
                </Link>
              ) : (
                <span className="menu-item menu-item-disabled" aria-disabled="true">
                  {item.icone}
                  {item.nome}
                  <span className="ml-auto whitespace-nowrap rounded-full bg-white/12 px-2 py-0.5 text-[12px] font-medium text-white/70">em breve</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function AlternarTema() {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => setEscuro(document.documentElement.classList.contains("dark")), []);

  function alternar() {
    const raiz = document.documentElement;
    const proximo = !escuro;
    raiz.classList.toggle("dark", proximo);
    if (proximo) raiz.dataset.dsScheme = "dark";
    else delete raiz.dataset.dsScheme;
    localStorage.setItem("tema", proximo ? "escuro" : "claro");
    setEscuro(proximo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ds-separator)] bg-[var(--ds-surface)] text-[var(--ds-label-2)] hover:text-[var(--ds-label)]"
    >
      {escuro ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

export function Painel({ children }: { children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <div data-ds="" className="min-h-screen">
      <BarraLateral aberta={menuAberto} aoFechar={() => setMenuAberto(false)} />
      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-[var(--ds-scrim)] lg:hidden" onClick={() => setMenuAberto(false)} aria-hidden="true" />
      )}
      <div className="min-w-0 lg:ml-[260px]">
        <header className="app-header sticky top-0 z-30 flex items-center gap-3 px-4 py-3 md:px-6">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--ds-separator)] text-[var(--ds-label-2)] lg:hidden"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <span className="rounded-full bg-[var(--ds-orange-soft)] px-3 py-1 text-[12px] font-medium text-[var(--ds-orange-deep)]">
            Versão local, sem login
          </span>
          <div className="ml-auto">
            <AlternarTema />
          </div>
        </header>
        <main className="mx-auto max-w-[1536px] px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
