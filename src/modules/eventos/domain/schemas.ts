import { z } from "zod";

// Entradas das server actions do Resumo do evento (docs/07 §6.1).

const contagem = z.preprocess(
  (valor) => (valor === undefined || valor === null || valor === "" ? null : valor),
  z.coerce
    .number({ error: "Informe um número." })
    .int("Use um número inteiro.")
    .min(0, "Informe um número maior ou igual a zero.")
    .max(1_000_000, "Número grande demais.")
    .nullable(),
);

/** `atualizadoEm` é o que estava na tela (compare-and-set): se o evento mudou depois, pede para recarregar. */
export const salvarDadosDoEventoSchema = z.object({
  eventoId: z.uuid("Identificador inválido."),
  expectativaPublico: contagem,
  pessoasNaFila: contagem,
  atualizadoEm: z.iso.datetime({ offset: true, error: "Versão do evento inválida. Recarregue a página." }),
});

export type SalvarDadosDoEvento = z.output<typeof salvarDadosDoEventoSchema>;
