// Rooming list (docs/07 §5.3): ocupantes ≤ capacidade; num quarto com sexo, só pessoas desse sexo.

export type Sexo = "F" | "M";

export type QuartoDoRooming = { id: string; capacidade: number; sexo: Sexo | null; ocupantes: { convocacaoId: string; sexo: Sexo | null }[] };

export type RecusaDoQuarto = "QUARTO_CHEIO" | "SEXO_DIFERENTE" | "SEM_SEXO_NO_CADASTRO";

/** Pode pôr a pessoa no quarto? Quem já está nele não ocupa uma segunda cama. */
export function podeOcupar(quarto: QuartoDoRooming, pessoa: { convocacaoId: string; sexo: Sexo | null }): { ok: true } | { ok: false; motivo: RecusaDoQuarto } {
  const outros = quarto.ocupantes.filter((ocupante) => ocupante.convocacaoId !== pessoa.convocacaoId);
  if (outros.length >= quarto.capacidade) return { ok: false, motivo: "QUARTO_CHEIO" };
  if (quarto.sexo !== null) {
    if (pessoa.sexo === null) return { ok: false, motivo: "SEM_SEXO_NO_CADASTRO" };
    if (pessoa.sexo !== quarto.sexo) return { ok: false, motivo: "SEXO_DIFERENTE" };
  }
  return { ok: true };
}

export function mensagemDaRecusa(motivo: RecusaDoQuarto, nomeDoQuarto: string): string {
  switch (motivo) {
    case "QUARTO_CHEIO":
      return `O ${nomeDoQuarto} já está com todas as camas ocupadas.`;
    case "SEXO_DIFERENTE":
      return `O ${nomeDoQuarto} é de outro sexo. Escolha outro quarto ou mude o quarto para misto.`;
    case "SEM_SEXO_NO_CADASTRO":
      return `A pessoa está sem sexo no cadastro e o ${nomeDoQuarto} é separado por sexo. Complete o cadastro em Pessoas ou use um quarto misto.`;
    default: {
      const desconhecido: never = motivo;
      throw new Error(`recusa desconhecida: ${String(desconhecido)}`);
    }
  }
}

/** Aviso do cartão: quarto misto com pessoas de sexos diferentes. */
export function misturaSexos(ocupantes: { sexo: Sexo | null }[]): boolean {
  return new Set(ocupantes.map((ocupante) => ocupante.sexo).filter((sexo) => sexo !== null)).size > 1;
}

export type Alocacao = { convocacaoId: string; quartoId: string };

/**
 * Sugestão de rooming por sexo (pura). Cada pessoa sem quarto vai, nesta ordem, para: o quarto do mesmo sexo
 * com vaga mais cheio; um quarto misto onde todo mundo é do mesmo sexo; um quarto misto vazio.
 * Sem sexo no cadastro só entra em quarto misto vazio ou só com gente sem sexo. Quem não couber fica de fora.
 */
export function sugerirRooming(
  semQuarto: { convocacaoId: string; sexo: Sexo | null }[],
  quartos: QuartoDoRooming[],
): { alocacoes: Alocacao[]; semLugar: string[] } {
  const estado = quartos.map((quarto) => ({ ...quarto, ocupantes: [...quarto.ocupantes] }));
  const alocacoes: Alocacao[] = [];
  const semLugar: string[] = [];

  const ordem = [...semQuarto].sort((a, b) => (a.sexo ?? "Z").localeCompare(b.sexo ?? "Z"));
  for (const pessoa of ordem) {
    const livres = estado.filter((quarto) => quarto.ocupantes.length < quarto.capacidade);
    const maisCheioPrimeiro = (a: QuartoDoRooming, b: QuartoDoRooming) => b.ocupantes.length - a.ocupantes.length;
    const mesmoSexo = livres.filter((quarto) => pessoa.sexo !== null && quarto.sexo === pessoa.sexo).sort(maisCheioPrimeiro);
    const mistoCompativel = livres
      .filter((quarto) => quarto.sexo === null && quarto.ocupantes.length > 0 && quarto.ocupantes.every((ocupante) => ocupante.sexo === pessoa.sexo))
      .sort(maisCheioPrimeiro);
    const mistoVazio = livres.filter((quarto) => quarto.sexo === null && quarto.ocupantes.length === 0);
    const escolhido = mesmoSexo[0] ?? mistoCompativel[0] ?? mistoVazio[0];
    if (!escolhido) {
      semLugar.push(pessoa.convocacaoId);
      continue;
    }
    escolhido.ocupantes.push(pessoa);
    alocacoes.push({ convocacaoId: pessoa.convocacaoId, quartoId: escolhido.id });
  }
  return { alocacoes, semLugar };
}

export function rotuloDaCapacidade(capacidade: number): string {
  switch (capacidade) {
    case 1:
      return "single";
    case 2:
      return "duplo";
    case 3:
      return "triplo";
    case 4:
      return "quádruplo";
    default:
      return `${capacidade} lugares`;
  }
}

export function rotuloDoSexoDoQuarto(sexo: Sexo | null): string {
  if (sexo === "F") return "Feminino";
  if (sexo === "M") return "Masculino";
  return "Misto";
}

/** Texto para o hotel ("Copiar rooming list"). */
export function textoDoRooming(hospedagem: {
  hotel: string;
  checkIn: string;
  checkOut: string;
  quartos: { nome: string; capacidade: number; ocupantes: string[] }[];
}): string {
  const data = (valor: string) => `${valor.slice(8, 10)}/${valor.slice(5, 7)}`;
  return [
    `Rooming list — ${hospedagem.hotel}`,
    `Check-in ${data(hospedagem.checkIn)} · check-out ${data(hospedagem.checkOut)}`,
    ...hospedagem.quartos.map((quarto) => `${quarto.nome} (${rotuloDaCapacidade(quarto.capacidade)}): ${quarto.ocupantes.join(", ") || "vazio"}`),
  ].join("\n");
}
