// Caronas: o motorista é uma pessoa escalada com veículo (pessoa_veiculo); os passageiros apontam para a carona
// em convocacao.carona_id. `lugares` do veículo conta só os passageiros (o motorista não entra na conta).

export function lugaresLivres(lugares: number, passageiros: number): number {
  return Math.max(0, lugares - passageiros);
}

export type RecusaDaCarona = "CARRO_CHEIO" | "MOTORISTA_NAO_PODE_SER_PASSAGEIRO";

export function podeEntrarNaCarona(
  carona: { lugares: number; passageiros: string[]; motoristaPessoaId: string },
  passageiro: { pessoaId: string; convocacaoId: string },
): { ok: true } | { ok: false; motivo: RecusaDaCarona } {
  if (passageiro.pessoaId === carona.motoristaPessoaId) return { ok: false, motivo: "MOTORISTA_NAO_PODE_SER_PASSAGEIRO" };
  const outros = carona.passageiros.filter((id) => id !== passageiro.convocacaoId);
  if (outros.length >= carona.lugares) return { ok: false, motivo: "CARRO_CHEIO" };
  return { ok: true };
}

export function mensagemDaRecusaDaCarona(motivo: RecusaDaCarona, motorista: string, lugares: number): string {
  switch (motivo) {
    case "CARRO_CHEIO":
      return `O carro de ${motorista} já está com os ${lugares} lugares ocupados.`;
    case "MOTORISTA_NAO_PODE_SER_PASSAGEIRO":
      return `${motorista} é o motorista desta carona.`;
    default: {
      const desconhecido: never = motivo;
      throw new Error(`recusa desconhecida: ${String(desconhecido)}`);
    }
  }
}
