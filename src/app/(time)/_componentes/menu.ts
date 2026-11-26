import { type Ator, pode } from "@/core/autorizacao";

export type ItemDoMenu =
  | "Dashboard"
  | "Calendário"
  | "Escalas"
  | "Comunicação"
  | "Disponibilidade"
  | "Pessoas"
  | "Voos"
  | "Hospedagem"
  | "Custos"
  | "Configurações";

/**
 * `raizes` acendem o item também nas subrotas (ex.: /escalas/aprovacao acende Escalas). Voos e Hospedagem dividem
 * /logistica: Voos fica só com as passagens; Hospedagem tem os quartos e os créditos de hotel. As caronas ficam na
 * escala do evento (/logistica/caronas é só um redirecionamento para lá).
 */
export const ROTAS_DO_MENU: { nome: ItemDoMenu; href: string; raizes: string[] }[] = [
  // A antiga "Início" (a rota continua /inicio). Hoje é a dashboard do sistema; a dos staffs entra depois.
  { nome: "Dashboard", href: "/inicio", raizes: ["/inicio"] },
  { nome: "Calendário", href: "/calendario", raizes: ["/calendario"] },
  { nome: "Escalas", href: "/escalas", raizes: ["/escalas"] },
  { nome: "Comunicação", href: "/comunicacao", raizes: ["/comunicacao"] },
  { nome: "Disponibilidade", href: "/disponibilidade", raizes: ["/disponibilidade"] },
  { nome: "Pessoas", href: "/pessoas", raizes: ["/pessoas"] },
  { nome: "Voos", href: "/logistica/voos", raizes: ["/logistica/voos"] },
  { nome: "Hospedagem", href: "/logistica/hospedagem", raizes: ["/logistica/hospedagem", "/logistica/caronas", "/logistica/creditos"] },
  { nome: "Custos", href: "/custos", raizes: ["/custos"] },
  { nome: "Configurações", href: "/configuracoes/regras-de-custo", raizes: ["/configuracoes"] },
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
  // A aba Logística do evento junta voos, hospedagem e caronas: abre em Voos, então acende Voos.
  logistica: "Voos",
  custos: "Custos",
};

/**
 * Item aceso no menu. Nas telas do evento vale a origem (doc 08 §2): /eventos/[id]/escala acende Escalas,
 * /eventos/[id]/comunicacao acende Comunicação…; o Resumo (/eventos/[id]) acende Calendário.
 */
export function itemAtivoDoMenu(caminho: string): ItemDoMenu | null {
  const doEvento = /^\/eventos\/[^/]+(?:\/([^/]+))?/.exec(caminho);
  if (doEvento) return (doEvento[1] && ABA_DO_EVENTO[doEvento[1]]) || "Calendário";
  return ROTAS_DO_MENU.find((rota) => rota.raizes.some((raiz) => caminho === raiz || caminho.startsWith(`${raiz}/`)))?.nome ?? null;
}
