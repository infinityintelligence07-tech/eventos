import { Construction, Inbox, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { CARTAO } from "./classes";

/**
 * Dentro do cartão onde a lista estaria. Vazio de verdade: explica e oferece a próxima ação.
 * Vazio por filtro: "Nenhum resultado com esses filtros." + "Limpar filtros".
 */
export function EstadoVazio({
  icone = <Inbox size={32} aria-hidden />,
  titulo,
  nivel = "h3",
  acao,
  children,
}: {
  icone?: ReactNode;
  titulo: string;
  /** h2 quando o estado vazio é o conteúdo principal da página; h1 quando a página não tem cabeçalho. */
  nivel?: "h1" | "h2" | "h3";
  acao?: ReactNode;
  children?: ReactNode;
}) {
  const Titulo = nivel;
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-[var(--ds-label-2)]">{icone}</span>
      <Titulo className="text-[15px] font-semibold">{titulo}</Titulo>
      {children && <div className="max-w-[440px] text-[14px] text-[var(--ds-label-2)]">{children}</div>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

/** Página-esqueleto desta rodada: a frente dona da rota troca pelo conteúdo. */
export function EmConstrucao({ secao, children }: { secao: string; children?: ReactNode }) {
  return (
    <EstadoVazio icone={<Construction size={32} aria-hidden />} titulo="Em construção nesta rodada" nivel="h2">
      <p>{secao}</p>
      {children}
    </EstadoVazio>
  );
}

/** Dado que vem de fora (IAM Control, cadastro do GH): texto, nunca campo desabilitado. */
export function SomenteLeitura({ origem }: { origem: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[var(--ds-label-2)]">
      <Lock size={14} aria-hidden />
      {origem}
    </span>
  );
}

/** Para quando houver login (Aprovação de escala e Configurações). Hoje não aparece. */
export function SemPermissao() {
  return (
    <EstadoVazio icone={<Lock size={32} aria-hidden />} titulo="Esta área é da líder do time" nivel="h2">
      Peça à Patricia para fazer esta ação ou liberar seu acesso.
    </EstadoVazio>
  );
}

/** Forma do conteúdo enquanto carrega (loading.tsx). A região que carrega leva aria-busy e "Carregando…" em sr-only. */
export function Esqueleto({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-[var(--ds-radius-sm)] bg-[var(--ds-fill-4)] motion-reduce:animate-none ${className}`} />;
}

function EsqueletoDoCabecalho() {
  return (
    <div className="mb-5 flex flex-col gap-2">
      <Esqueleto className="h-8 w-56" />
      <Esqueleto className="h-4 w-80 max-w-full" />
    </div>
  );
}

function EsqueletoDeNumeros() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((indice) => (
        <div key={indice} className={`${CARTAO} flex flex-col gap-2 px-5 py-4`}>
          <Esqueleto className="h-3 w-24" />
          <Esqueleto className="h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

function EsqueletoDeCartoes({ quantidade }: { quantidade: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: quantidade }, (_, indice) => (
        <div key={indice} className={`${CARTAO} flex flex-col gap-2 p-5`}>
          <Esqueleto className="h-4 w-40" />
          <Esqueleto className="h-3 w-full" />
          <Esqueleto className="h-3 w-3/4" />
          <Esqueleto className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function EsqueletoDeTabela({ linhas }: { linhas: number }) {
  return (
    <div className={`${CARTAO} overflow-hidden`}>
      <div className="flex gap-6 bg-[var(--ds-surface-1)] px-4 py-3">
        <Esqueleto className="h-3 w-32" />
        <Esqueleto className="h-3 w-20" />
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="ml-auto h-3 w-16" />
      </div>
      {Array.from({ length: linhas }, (_, indice) => (
        <div key={indice} className="flex items-center gap-6 border-t border-[var(--ds-separator)] px-4 py-4">
          <Esqueleto className="h-4 w-48" />
          <Esqueleto className="h-4 w-24" />
          <Esqueleto className="h-5 w-28 rounded-full" />
          <Esqueleto className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function EsqueletoDosFiltros() {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Esqueleto className="h-10 w-60" />
      <Esqueleto className="h-10 w-40" />
      <Esqueleto className="h-10 w-40" />
    </div>
  );
}

/**
 * Forma da página enquanto carrega (loading.tsx). `conteudo` é para rotas cujo layout já mostra o cabeçalho
 * (evento, Configurações, Logística).
 */
export type FormaDoEsqueleto = "painel" | "lista" | "calendario" | "conteudo";

function corpoDoEsqueleto(forma: FormaDoEsqueleto): ReactNode {
  switch (forma) {
    case "painel":
      return (
        <>
          <EsqueletoDoCabecalho />
          <EsqueletoDeNumeros />
          <EsqueletoDeCartoes quantidade={6} />
        </>
      );
    case "lista":
      return (
        <>
          <EsqueletoDoCabecalho />
          <EsqueletoDosFiltros />
          <EsqueletoDeTabela linhas={8} />
        </>
      );
    case "calendario":
      return (
        <>
          <EsqueletoDoCabecalho />
          <EsqueletoDeNumeros />
          <div className={`${CARTAO} p-5`}>
            <Esqueleto className="mb-4 h-6 w-48" />
            <Esqueleto className="h-[420px] w-full" />
          </div>
        </>
      );
    case "conteudo":
      return (
        <>
          <EsqueletoDosFiltros />
          <EsqueletoDeTabela linhas={6} />
        </>
      );
    default: {
      const desconhecida: never = forma;
      throw new Error(`forma de esqueleto desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function EsqueletoDePagina({ forma }: { forma: FormaDoEsqueleto }) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Carregando…
      </p>
      {corpoDoEsqueleto(forma)}
    </div>
  );
}

/** Rodapé fixo da Montar escala e do detalhe de custo: resumo à esquerda, ação principal à direita. */
export function BarraDeAcao({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ds-separator)] bg-[color-mix(in_srgb,var(--ds-surface)_92%,transparent)] px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      {children}
    </div>
  );
}
