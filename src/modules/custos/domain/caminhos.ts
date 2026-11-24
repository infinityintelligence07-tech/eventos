/** Endereço em que o próprio staff envia a solicitação de custo (pede login). Sem evento: a lista dos eventos abertos da pessoa. */
export function caminhoDoFormularioDeCusto(eventoId?: string): string {
  return eventoId ? `/solicitar-custo/${eventoId}` : "/solicitar-custo";
}
