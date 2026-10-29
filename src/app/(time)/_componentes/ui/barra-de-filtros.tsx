"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

// doc 08 §3.7: filtros na URL (searchParams), para o link poder ser compartilhado e o "voltar" funcionar.
// Ordem: busca → seletores → atalhos → "Limpar filtros".

const SELETOR =
  "h-10 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] pl-3 pr-8 text-[14px] text-[var(--ds-label)]";

function useEnderecoComFiltro() {
  const caminho = usePathname();
  const parametros = useSearchParams();
  return useMemo(
    () => ({
      atual: (nome: string) => parametros.get(nome),
      com(mudancas: Record<string, string | null>): string {
        const proximos = new URLSearchParams(parametros);
        for (const [nome, valor] of Object.entries(mudancas)) {
          if (valor) proximos.set(nome, valor);
          else proximos.delete(nome);
        }
        const texto = proximos.toString();
        return texto ? `${caminho}?${texto}` : caminho;
      },
    }),
    [caminho, parametros],
  );
}

export type OpcaoDeFiltro = { valor: string; rotulo: string };

export function SeletorDeFiltro({
  nome,
  rotulo,
  todos,
  opcoes,
  valor,
}: {
  nome: string;
  rotulo: string;
  todos: string;
  opcoes: OpcaoDeFiltro[];
  /** Valor já validado pela página (inválido = null). Sem a prop, lê da URL. */
  valor?: string | null;
}) {
  const router = useRouter();
  const endereco = useEnderecoComFiltro();
  return (
    <label className="flex items-center gap-2 text-[13px] text-[var(--ds-label-2)]">
      {rotulo}
      <select
        className={SELETOR}
        value={(valor === undefined ? endereco.atual(nome) : valor) ?? ""}
        onChange={(evento) => router.push(endereco.com({ [nome]: evento.target.value || null }))}
      >
        <option value="">{todos}</option>
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Busca que aplica 300 ms depois de parar de digitar (troca a URL sem empilhar histórico). */
export function BuscaDeFiltro({ nome = "busca", rotulo, placeholder }: { nome?: string; rotulo: string; placeholder?: string }) {
  const router = useRouter();
  const endereco = useEnderecoComFiltro();
  const naUrl = endereco.atual(nome) ?? "";
  const [texto, setTexto] = useState(naUrl);

  useEffect(() => setTexto(naUrl), [naUrl]);

  useEffect(() => {
    if (texto.trim() === naUrl) return;
    const espera = setTimeout(() => router.replace(endereco.com({ [nome]: texto.trim() || null })), 300);
    return () => clearTimeout(espera);
  }, [texto, naUrl, nome, router, endereco]);

  return (
    <label
      data-ds-field=""
      className="flex h-10 min-w-[240px] items-center gap-2 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3"
    >
      <Search size={18} aria-hidden className="shrink-0 text-[var(--ds-label-2)]" />
      <span className="sr-only">{rotulo}</span>
      <input
        type="search"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent text-[14px] text-[var(--ds-label)] outline-none"
      />
    </label>
  );
}

export type AtalhoDeFiltro = { valor: string | null; rotulo: string; quantidade?: number };

const ESTILO_DO_ATALHO = {
  atalhos: {
    lista: "flex flex-wrap gap-1",
    item: "inline-flex h-8 items-center rounded-full px-3 text-[13px]",
    ativo: "bg-[var(--ds-tint-soft)] font-semibold text-[var(--ds-tint-text)]",
    inativo: "text-[var(--ds-label-2)] hover:bg-[var(--ds-fill-4)]",
  },
  segmentado: {
    lista: "inline-flex flex-wrap gap-0.5 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] p-0.5",
    item: "inline-flex h-8 items-center rounded-[8px] px-3 text-[13px] font-medium",
    ativo: "bg-[var(--ds-brand)] text-white",
    inativo: "text-[var(--ds-label)] hover:bg-[var(--ds-fill-4)]",
  },
} as const;

/**
 * Segmentos tipo "Para auditar (12) | Aprovadas | Todas". `valor: null` = sem o filtro na URL.
 * `segmentado` é para trocar o que a tela mostra (ex.: Escalação | Hospedagem), acima dos filtros de situação.
 */
export function AtalhosDeFiltro({
  nome,
  rotulo,
  opcoes,
  estilo = "atalhos",
}: {
  nome: string;
  rotulo: string;
  opcoes: AtalhoDeFiltro[];
  estilo?: keyof typeof ESTILO_DO_ATALHO;
}) {
  const endereco = useEnderecoComFiltro();
  const atual = endereco.atual(nome);
  const classes = ESTILO_DO_ATALHO[estilo];
  return (
    <nav aria-label={rotulo}>
      <ul className={classes.lista}>
        {opcoes.map((opcao) => {
          const ativo = (opcao.valor ?? null) === (atual || null);
          return (
            <li key={opcao.valor ?? "todos"}>
              <Link
                href={endereco.com({ [nome]: opcao.valor })}
                aria-current={ativo ? "page" : undefined}
                className={`${classes.item} ${ativo ? classes.ativo : classes.inativo}`}
              >
                {opcao.rotulo}
                {opcao.quantidade !== undefined && <span className="tabular-nums">&nbsp;({opcao.quantidade.toLocaleString("pt-BR")})</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Só aparece com algum dos filtros ativo. */
export function LimparFiltros({ nomes }: { nomes: string[] }) {
  const endereco = useEnderecoComFiltro();
  if (!nomes.some((nome) => endereco.atual(nome))) return null;
  return (
    <Link
      href={endereco.com(Object.fromEntries(nomes.map((nome) => [nome, null])))}
      className="inline-flex h-10 items-center px-1 text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline"
    >
      Limpar filtros
    </Link>
  );
}

/** Invólucro da barra, com o resultado anunciado ao leitor de tela ("12 eventos encontrados"). */
export function BarraDeFiltros({ resultado, nomes, children }: { resultado?: string; nomes?: string[]; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {nomes && <LimparFiltros nomes={nomes} />}
      {resultado !== undefined && (
        <p className="sr-only" aria-live="polite">
          {resultado}
        </p>
      )}
    </div>
  );
}
