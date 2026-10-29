import { type Ator, pode } from "@/core/autorizacao";

export type ItemDoMenu =
  | "Início"
  | "Calendário"
  | "Escalas"
  | "Comunicação"
  | "Disponibilidade"
  | "Pessoas"
  | "Logística e SDC"
  | "Custos"
  | "Configurações";

/** `raiz` acende o item também nas subrotas (ex.: /logistica/hospedagem acende Logística). */
export const ROTAS_DO_MENU: { nome: ItemDoMenu; href: string; raiz: string }[] = [
  { nome: "Início", href: "/inicio", raiz: "/inicio" },
  { nome: "Calendário", href: "/calendario", raiz: "/calendario" },
  { nome: "Escalas", href: "/escalas", raiz: "/escalas" },
  { nome: "Comunicação", href: "/comunicacao", raiz: "/comunicacao" },
  { nome: "Disponibilidade", href: "/disponibilidade", raiz: "/disponibilidade" },
  { nome: "Pessoas", href: "/pessoas", raiz: "/pessoas" },
  { nome: "Logística e SDC", href: "/logistica/voos", raiz: "/logistica" },
  { nome: "Custos", href: "/custos", raiz: "/custos" },
  { nome: "Configurações", href: "/configuracoes/regras-de-custo", raiz: "/configuracoes" },
];

/**
 * Primeira tela de Configurações para o ator: a líder abre em Regras de custo; o time, que só consulta as regras
 * (docs/09 §4.2), abre em Modelos de copy, que ele edita.
 */
export function inicioDasConfiguracoes(ator: Pick<Ator, "perfis">): string {
  return pode(ator, "config.regras_custo") ? "/configuracoes/regras-de-custo" : "/configuracoes/modelos-de-copy";
}

/** Todo o menu é de leitura para os dois perfis; muda só o destino de Configurações. */
export function rotasDoMenu(ator: Pick<Ator, "perfis">): typeof ROTAS_DO_MENU {
  return ROTAS_DO_MENU.map((rota) => (rota.nome === "Configurações" ? { ...rota, href: inicioDasConfiguracoes(ator) } : rota));
}

const ABA_DO_EVENTO: Record<string, ItemDoMenu> = {
  escala: "Escalas",
  comunicacao: "Comunicação",
  logistica: "Logística e SDC",
  custos: "Custos",
};

/**
 * Item aceso no menu. Nas telas do evento vale a origem (doc 08 §2): /eventos/[id]/escala acende Escalas,
 * /eventos/[id]/comunicacao acende Comunicação…; o Resumo (/eventos/[id]) acende Calendário.
 */
export function itemAtivoDoMenu(caminho: string): ItemDoMenu | null {
  const doEvento = /^\/eventos\/[^/]+(?:\/([^/]+))?/.exec(caminho);
  if (doEvento) return (doEvento[1] && ABA_DO_EVENTO[doEvento[1]]) || "Calendário";
  return ROTAS_DO_MENU.find((rota) => caminho === rota.raiz || caminho.startsWith(`${rota.raiz}/`))?.nome ?? null;
}
