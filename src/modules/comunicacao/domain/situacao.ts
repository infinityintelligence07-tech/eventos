import type { CopyGerada } from "./copy";

// Situação da copy na tela (docs/07 §4.3). "Copiar" não grava nada; só "Marcar como enviada" grava a mensagem.

/** Valores do CHECK modelo_copy_tipo_check. */
export const TIPOS_DE_MODELO = ["ESCALACAO", "HOSPEDAGEM", "LEMBRETE", "ALTERACAO"] as const;
export type TipoDeModelo = (typeof TIPOS_DE_MODELO)[number];

export function rotuloDoTipoDeModelo(tipo: TipoDeModelo): string {
  switch (tipo) {
    case "ESCALACAO":
      return "Escalação";
    case "HOSPEDAGEM":
      return "Hospedagem";
    case "LEMBRETE":
      return "Lembrete";
    case "ALTERACAO":
      return "Alteração";
    default: {
      const desconhecido: never = tipo;
      throw new Error(`tipo de modelo desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Valores do CHECK mensagem_canal_check. */
export type CanalDaMensagem = "COPIADO" | "WHATSAPP";

export function rotuloDoCanal(canal: CanalDaMensagem): string {
  switch (canal) {
    case "COPIADO":
      return "copiada";
    case "WHATSAPP":
      return "pelo WhatsApp";
    default: {
      const desconhecido: never = canal;
      throw new Error(`canal desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Última mensagem ENVIADA do mesmo tipo de modelo para a convocação. */
export type EnvioAnterior = { dadosHash: string; enviadaEm: Date; canal: CanalDaMensagem };

export type SituacaoDaCopy = "FALTA_DADO" | "DESATUALIZADA" | "PRONTA" | "ENVIADA";

/** Ordem da lista de pessoas: o que pede ação primeiro. */
export const ORDEM_DAS_SITUACOES: readonly SituacaoDaCopy[] = ["FALTA_DADO", "DESATUALIZADA", "PRONTA", "ENVIADA"];

export function situacaoDaCopy(copy: Pick<CopyGerada, "pronta" | "dadosHash">, ultimaEnviada: EnvioAnterior | null): SituacaoDaCopy {
  if (!copy.pronta) return "FALTA_DADO";
  if (!ultimaEnviada) return "PRONTA";
  return ultimaEnviada.dadosHash === copy.dadosHash ? "ENVIADA" : "DESATUALIZADA";
}

export type ContagemDeSituacoes = Record<SituacaoDaCopy, number>;

export function contarSituacoes(situacoes: Iterable<SituacaoDaCopy>): ContagemDeSituacoes {
  const contagem: ContagemDeSituacoes = { FALTA_DADO: 0, DESATUALIZADA: 0, PRONTA: 0, ENVIADA: 0 };
  for (const situacao of situacoes) contagem[situacao] += 1;
  return contagem;
}

/** "o voo de ida" / "o voo de ida e o sexo da pessoa" / "a, b e c" — para "Esta copy está bloqueada: falta …". */
export function listarEmPortugues(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

export type RecusaDoEnvio = "ESCALA_NAO_APROVADA" | "CONVOCACAO_INATIVA" | "MODELO_INATIVO" | "FALTA_DADO" | "COPY_MUDOU" | "JA_ENVIADA";

/**
 * Pode marcar como enviada? Escala aprovada ou comunicada, pessoa ainda na escala, modelo ativo, copy completa,
 * igual à que estava na tela (mesmo hash) e ainda não enviada com esses dados.
 */
export function recusaDoEnvio(entrada: {
  escalaComunicavel: boolean;
  convocacaoAtiva: boolean;
  modeloAtivo: boolean;
  copy: Pick<CopyGerada, "pronta" | "dadosHash">;
  ultimaEnviada: EnvioAnterior | null;
  dadosHashDaTela: string;
}): RecusaDoEnvio | null {
  if (!entrada.escalaComunicavel) return "ESCALA_NAO_APROVADA";
  if (!entrada.convocacaoAtiva) return "CONVOCACAO_INATIVA";
  if (!entrada.modeloAtivo) return "MODELO_INATIVO";
  const situacao = situacaoDaCopy(entrada.copy, entrada.ultimaEnviada);
  if (situacao === "FALTA_DADO") return "FALTA_DADO";
  if (entrada.copy.dadosHash !== entrada.dadosHashDaTela) return "COPY_MUDOU";
  if (situacao === "ENVIADA") return "JA_ENVIADA";
  return null;
}
