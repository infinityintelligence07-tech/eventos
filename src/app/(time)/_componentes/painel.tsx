"use client";

import {
  CalendarCheck,
  CalendarDays,
  Contact,
  Database,
  House,
  Lock,
  LogOut,
  type LucideIcon,
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

import { sair } from "../_servidor/sessao";
import { type ItemDoMenu, itemAtivoDoMenu, ROTAS_DO_MENU, rotasDoMenu } from "./menu";
import { ProvedorDeToast } from "./ui/toast";

const ICONES: Record<ItemDoMenu, LucideIcon> = {
  Início: House,
  Calendário: CalendarDays,
  Escalas: Users,
  Comunicação: MessageCircle,
  Disponibilidade: CalendarCheck,
  Pessoas: Contact,
  "Logística e SDC": Plane,
  Custos: Receipt,
  Configurações: Settings,
};

export type UsuarioDoPainel = {
  nome: string;
  email: string;
  origem: "SESSAO" | "LOCAL" | "DEMO";
  perfis: ("EVENTOS_TIME" | "EVENTOS_LIDER")[];
};

/** Calculado no servidor pelo layout (guarda de escrita e ator da requisição). */
export type AmbienteDoPainel = { escritaLiberada: boolean; usuario: UsuarioDoPainel | null };

function BarraLateral({ aberta, aoFechar, rotas }: { aberta: boolean; aoFechar: () => void; rotas: typeof ROTAS_DO_MENU }) {
  const ativoNoMenu = itemAtivoDoMenu(usePathname());
  return (
    <aside
      className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col px-4 transition-transform duration-200 lg:translate-x-0 ${
        aberta ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between pt-6 pb-2">
        <Link href="/inicio" className="flex items-center gap-3" onClick={aoFechar}>
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
          {rotas.map((item) => {
            const Icone = ICONES[item.nome];
            const ativo = item.nome === ativoNoMenu;
            return (
              <li key={item.nome}>
                <Link
                  href={item.href}
                  onClick={aoFechar}
                  aria-current={ativo ? "page" : undefined}
                  className={`menu-item ${ativo ? "menu-item-active" : "menu-item-inactive"}`}
                >
                  <Icone size={20} className="shrink-0" aria-hidden />
                  {item.nome}
                </Link>
              </li>
            );
          })}
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

function SeloDoAmbiente({ ambiente }: { ambiente: AmbienteDoPainel }) {
  const local = ambiente.usuario?.origem === "LOCAL";
  if (ambiente.escritaLiberada) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-green-soft)] px-3 py-1 text-[12px] font-medium text-[var(--ds-green-deep)]">
        <Database size={14} aria-hidden />
        {local ? "Versão local" : "Escrita liberada"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-orange-soft)] px-3 py-1 text-[12px] font-medium text-[var(--ds-orange-deep)]"
      title="Escrita desligada neste ambiente: dá para consultar, mas nada é gravado."
    >
      <Lock size={14} aria-hidden />
      {ambiente.usuario?.origem === "DEMO" ? "Demo · somente leitura" : "Somente leitura"}
    </span>
  );
}

function rotuloDosPerfis(perfis: UsuarioDoPainel["perfis"]): string {
  return perfis.includes("EVENTOS_LIDER") ? "Líder do time" : "Time de eventos";
}

/** Nome, perfil, "trocar" (só no modo local) e "Sair" (docs/09 §3.3; a demo sem login não tem "Sair"). */
function UsuarioNoCabecalho({ usuario }: { usuario: UsuarioDoPainel }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden min-w-0 text-right sm:block">
        <p className="truncate text-[13px] font-semibold text-[var(--ds-label)]" title={usuario.email}>
          {usuario.nome}
        </p>
        <p className="text-[12px] text-[var(--ds-label-2)]">
          {rotuloDosPerfis(usuario.perfis)}
          {usuario.origem === "LOCAL" && (
            <>
              {" · "}
              <Link href="/entrar-local" className="font-medium text-[var(--ds-tint-text)] hover:underline">
                trocar
              </Link>
            </>
          )}
        </p>
      </div>
      {usuario.origem !== "DEMO" && (
        <form action={sair}>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3 text-[14px] font-medium text-[var(--ds-label)] hover:bg-[var(--ds-surface-2)]"
            aria-label={`Sair (${usuario.nome})`}
          >
            <LogOut size={18} aria-hidden />
            <span className="hidden md:inline">Sair</span>
          </button>
        </form>
      )}
    </div>
  );
}

export function Painel({ ambiente, children }: { ambiente: AmbienteDoPainel; children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <div data-ds="" className="min-h-screen">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-[10px] focus:bg-[var(--ds-surface)] focus:px-4 focus:py-2 focus:text-[14px] focus:font-semibold focus:text-[var(--ds-tint-text)] focus:shadow-[var(--ds-shadow-3)]"
      >
        Pular para o conteúdo
      </a>
      <BarraLateral aberta={menuAberto} aoFechar={() => setMenuAberto(false)} rotas={ambiente.usuario ? rotasDoMenu(ambiente.usuario) : ROTAS_DO_MENU} />
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
          <SeloDoAmbiente ambiente={ambiente} />
          <div className="ml-auto flex items-center gap-3">
            {ambiente.usuario && <UsuarioNoCabecalho usuario={ambiente.usuario} />}
            <AlternarTema />
          </div>
        </header>
        <ProvedorDeToast>
          <main id="conteudo" tabIndex={-1} className="mx-auto max-w-[1536px] px-4 py-5 outline-none md:px-6 md:py-6">
            {children}
          </main>
        </ProvedorDeToast>
      </div>
    </div>
  );
}
