// Público e fila editáveis no Resumo do evento (docs/08 §5). A fila só existe no Confronto
// (base de pai/mãe): nos outros tipos o valor gravado não muda.

export const SIGLA_CONFRONTO = "CONF";

export function usaFila(tipoSigla: string | null): boolean {
  return tipoSigla === SIGLA_CONFRONTO;
}

export function dadosEditados(
  tipoSigla: string | null,
  atual: { pessoasNaFila: number | null },
  entrada: { expectativaPublico: number | null; pessoasNaFila: number | null },
): { expectativaPublico: number | null; pessoasNaFila: number | null } {
  return { expectativaPublico: entrada.expectativaPublico, pessoasNaFila: usaFila(tipoSigla) ? entrada.pessoasNaFila : atual.pessoasNaFila };
}
