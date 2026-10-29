// Classes da doc 08 §3, só com tokens --ds-*. Mesmas da tela de Calendário.

export const CARTAO = "rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-1)]";

export const CAMPO =
  "h-10 w-full rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3 text-[14px] text-[var(--ds-label)]";

export const TITULO_DA_PAGINA = "text-[28px] font-bold leading-[1.2] tracking-[-0.02em]";
/** h2 dos blocos da página. */
export const TITULO_DE_SECAO = "text-[17px] font-semibold tracking-[-0.01em]";
/** h3 dos cartões. */
export const TITULO_DE_CARTAO = "text-[15px] font-semibold";
export const EXPLICACAO_DE_CARTAO = "mt-0.5 text-[12px] text-[var(--ds-label-2)]";

export type VarianteDoBotao = "primario" | "secundario" | "perigo" | "perigo-confirmado" | "texto" | "icone";
export type TamanhoDoBotao = "normal" | "pequeno";

const BASE = "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px]";

function classesDaVariante(variante: VarianteDoBotao, pequeno: boolean): string {
  switch (variante) {
    case "primario":
      return `${BASE} bg-[var(--ds-brand)] font-semibold text-white hover:bg-[var(--ds-tint-deep)] ${pequeno ? "px-3" : "px-4"}`;
    case "secundario":
      return `${BASE} border border-[var(--ds-separator)] bg-[var(--ds-surface)] font-medium text-[var(--ds-label)] hover:bg-[var(--ds-surface-2)] ${pequeno ? "px-2.5" : "px-3"}`;
    case "perigo":
      return `${BASE} border border-[var(--ds-red-deep)] bg-[var(--ds-surface)] font-medium text-[var(--ds-red-deep)] hover:bg-[var(--ds-red-soft)] ${pequeno ? "px-2.5" : "px-3"}`;
    case "perigo-confirmado":
      return `${BASE} bg-[var(--ds-red-deep)] font-semibold text-white hover:opacity-90 ${pequeno ? "px-3" : "px-4"}`;
    case "texto":
      return "inline-flex shrink-0 items-center gap-1 px-1 font-medium text-[var(--ds-tint-text)] hover:underline";
    case "icone":
      return `${BASE} border border-[var(--ds-separator)] bg-[var(--ds-surface)] text-[var(--ds-label)] hover:bg-[var(--ds-surface-2)] ${pequeno ? "w-8" : "w-10"}`;
    default: {
      const desconhecida: never = variante;
      throw new Error(`variante de botão desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function classesDoBotao({
  variante = "secundario",
  tamanho = "normal",
  desabilitado = false,
}: { variante?: VarianteDoBotao; tamanho?: TamanhoDoBotao; desabilitado?: boolean } = {}): string {
  const pequeno = tamanho === "pequeno";
  return [
    classesDaVariante(variante, pequeno),
    pequeno ? "h-8 text-[13px]" : "h-10 text-[14px]",
    desabilitado ? "cursor-not-allowed opacity-50" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Id do campo a partir do nome do formulário ou do caminho do Zod: `linhas[0].quantidade` = `linhas.0.quantidade`. */
export function idDoCampo(nome: string): string {
  return `campo-${nome.replace(/\[\]/g, "").replace(/[^A-Za-z0-9_]+/g, "-").replace(/-+$/, "")}`;
}

/** Caminho do Zod (chave de `ResultadoAcao.campos`) a partir do nome do campo no formulário. */
export function caminhoDoCampo(nome: string): string {
  return nome.replace(/\[\]/g, "").replace(/\[(\d+)\]/g, ".$1").replace(/^\./, "");
}
