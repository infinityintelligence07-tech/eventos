"use client";

import { MoreHorizontal } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Botao } from "@/app/(time)/_componentes/ui";

export type ItemDoMenu = { rotulo: string; aoEscolher: () => void; perigo?: boolean };

/**
 * "Mais ações" por linha (doc 08 §3.5): botão só ícone + lista; Esc ou clique fora fecham e o foco volta ao botão.
 * A lista é `fixed` na posição do botão: as tabelas rolam dentro do cartão e cortariam uma lista `absolute`.
 */
export function MenuMaisAcoes({ rotulo, itens }: { rotulo: string; itens: ItemDoMenu[] }) {
  const [posicao, setPosicao] = useState<{ top: number; right: number } | null>(null);
  const aberto = posicao !== null;
  const raiz = useRef<HTMLDivElement>(null);
  const idDoMenu = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setPosicao(null);
    };
    const sumir = () => setPosicao(null);
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", sumir, true);
    window.addEventListener("resize", sumir);
    raiz.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("scroll", sumir, true);
      window.removeEventListener("resize", sumir);
    };
  }, [aberto]);

  function abrirOuFechar() {
    if (aberto) {
      setPosicao(null);
      return;
    }
    const botao = raiz.current?.querySelector("button[aria-haspopup]")?.getBoundingClientRect();
    if (botao) setPosicao({ top: botao.bottom + 4, right: window.innerWidth - botao.right });
  }

  function fechar() {
    setPosicao(null);
    raiz.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      fechar();
      return;
    }
    if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
    evento.preventDefault();
    const opcoes = [...(raiz.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const atual = opcoes.indexOf(document.activeElement as HTMLButtonElement);
    const proxima = (atual + (evento.key === "ArrowDown" ? 1 : -1) + opcoes.length) % opcoes.length;
    opcoes[proxima]?.focus();
  }

  return (
    <div ref={raiz} className="relative inline-block" onKeyDown={aoTeclar}>
      <Botao
        variante="icone"
        tamanho="pequeno"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idDoMenu : undefined}
        onClick={abrirOuFechar}
        icone={<MoreHorizontal size={16} aria-hidden />}
      />
      {aberto && (
        <div
          id={idDoMenu}
          role="menu"
          aria-label={rotulo}
          style={posicao ?? undefined}
          className="fixed z-40 min-w-[180px] rounded-[var(--ds-radius-md)] bg-[var(--ds-surface)] py-1 text-left shadow-[var(--ds-shadow-3)]"
        >
          {itens.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                setPosicao(null);
                item.aoEscolher();
              }}
              className={`block h-9 w-full px-3 text-left text-[14px] hover:bg-[var(--ds-surface-2)] ${
                item.perigo ? "text-[var(--ds-red-deep)]" : "text-[var(--ds-label)]"
              }`}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
