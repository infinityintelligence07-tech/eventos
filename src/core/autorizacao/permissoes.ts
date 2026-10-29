import type { Ator, PerfilDoEventos } from "./ator";

// Catálogo e matriz (docs/09 §4.1 e §4.2, com a §13.1: só a líder aprova, devolve e reabre; sem a SoD-1).
// Puro: sem banco, usado pelo app (actions, layout, menu) e pelos fluxos. Segregação de funções fica no domain/ do
// módulo dono (P2).

export const PERMISSOES = [
  "evento.editar",
  "escala.montar",
  "escala.registrar_resposta",
  "escala.aprovar",
  "escala.reabrir",
  "comunicacao.enviar",
  "disponibilidade.gerir",
  "disponibilidade.registrar_resposta",
  "pessoas.editar",
  "logistica.gerir",
  "logistica.registrar_retorno_sdc",
  "custos.registrar",
  "custos.auditar",
  "custos.reabrir_auditoria",
  "config.locais",
  "config.modelos_copy",
  "config.link_custos",
  "config.regras_vagas",
  "config.regras_custo",
] as const;

export type Permissao = (typeof PERMISSOES)[number];

const SO_DA_LIDER = new Set<Permissao>([
  "escala.aprovar",
  "escala.reabrir",
  "custos.reabrir_auditoria",
  "config.link_custos",
  "config.regras_vagas",
  "config.regras_custo",
]);

/** A líder tem tudo o que o time tem, mais aprovar, reabrir e as configurações que mexem em dinheiro e copys. */
function perfilPermite(perfil: PerfilDoEventos, permissao: Permissao): boolean {
  switch (perfil) {
    case "EVENTOS_LIDER":
      return true;
    case "EVENTOS_TIME":
      return !SO_DA_LIDER.has(permissao);
    default: {
      const desconhecido: never = perfil;
      void desconhecido;
      return false;
    }
  }
}

export function pode(ator: Pick<Ator, "perfis">, permissao: Permissao): boolean {
  return ator.perfis.some((perfil) => perfilPermite(perfil, permissao));
}

export const MENSAGEM_ACESSO_NEGADO = "Você não tem permissão para esta ação.";

export class AcessoNegadoError extends Error {
  constructor(
    readonly permissao: Permissao | null,
    mensagem: string = MENSAGEM_ACESSO_NEGADO,
  ) {
    super(mensagem);
    this.name = "AcessoNegadoError";
  }
}

export function exigirPermissao(ator: Pick<Ator, "perfis">, permissao: Permissao): void {
  if (!pode(ator, permissao)) throw new AcessoNegadoError(permissao);
}
