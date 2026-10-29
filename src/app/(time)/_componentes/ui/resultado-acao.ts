// Resultado das server actions (docs/07 §2.5). Sem dependência de servidor: importável em componente de cliente.

export type ResultadoAcao = { ok: true; mensagem?: string } | { ok: false; erro: string; campos?: Record<string, string[]> };
export type FalhaDaAcao = Extract<ResultadoAcao, { ok: false }>;

/** Estado inicial para useActionState: nenhuma ação rodou ainda (sem mensagem, não mostra toast). */
export const ACAO_NAO_EXECUTADA: ResultadoAcao = { ok: true };

/** Erros de um campo no resultado (`linhas.0.quantidade`, ver caminhoDoCampo). */
export function errosDoCampo(resultado: ResultadoAcao, caminho: string): string[] | undefined {
  return resultado.ok ? undefined : resultado.campos?.[caminho];
}

export function temErroDeCampo(resultado: ResultadoAcao): boolean {
  return !resultado.ok && resultado.campos !== undefined && Object.keys(resultado.campos).length > 0;
}
