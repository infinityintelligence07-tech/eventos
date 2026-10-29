import type { TipoDeModelo } from "./situacao";

export type ModeloDeCopy = { id: string; tipo: TipoDeModelo; nome: string; corpo: string; ativo: boolean; atualizadoEm: Date };

/**
 * Modelo ativo não troca de tipo: o tipo novo já pode ter o seu ativo (um por tipo) e o tipo antigo
 * ficaria sem modelo na Comunicação sem ninguém perceber. Desative antes.
 */
export function trocaDeTipoRecusada(atual: Pick<ModeloDeCopy, "tipo" | "ativo">, tipo: TipoDeModelo): boolean {
  return atual.ativo && atual.tipo !== tipo;
}

/** O banco garante um ativo por tipo (modelo_copy_ativo_unique); com dados antigos, vale o alterado por último. */
export function modeloEmUso(modelos: readonly ModeloDeCopy[], tipo: TipoDeModelo): ModeloDeCopy | null {
  let escolhido: ModeloDeCopy | null = null;
  for (const modelo of modelos) {
    if (modelo.tipo !== tipo || !modelo.ativo) continue;
    if (!escolhido || modelo.atualizadoEm > escolhido.atualizadoEm) escolhido = modelo;
  }
  return escolhido;
}
