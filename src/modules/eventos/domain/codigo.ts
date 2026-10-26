// Código canônico do evento: SIGLA_POLO_EDIÇÃO (ex.: ASM_POA_234, CONF_AM_60, IMERSAO_NEGOCIOS_SP_3).
// Usado para casar turma do IAM Control, linhas das planilhas e fatura da SDC sem depender de digitação.

export type PartesCodigo = { sigla: string; polo: string; edicao: number };

const SIGLA = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const POLO = /^[A-Z]{2,5}$/;
// A sigla pode ter "_" (IMERSAO_NEGOCIOS); polo e edição são sempre os dois últimos blocos.
const CODIGO = /^([A-Z0-9]+(?:_[A-Z0-9]+)*)_([A-Z]{2,5})_(\d{1,5})$/;

export class CodigoEventoInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Código de evento inválido: ${motivo}`);
    this.name = "CodigoEventoInvalidoError";
  }
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function montarCodigoEvento(partes: { sigla: string; polo: string; edicao: number | string }): string {
  const sigla = semAcento(partes.sigla.trim()).toUpperCase();
  const polo = semAcento(partes.polo.trim()).toUpperCase();
  const edicao = typeof partes.edicao === "number" ? partes.edicao : Number(String(partes.edicao).trim());

  if (!SIGLA.test(sigla) || sigla.length > 20) {
    throw new CodigoEventoInvalidoError(`sigla "${partes.sigla}"`);
  }
  if (!POLO.test(polo)) {
    throw new CodigoEventoInvalidoError(`polo "${partes.polo}"`);
  }
  if (!Number.isInteger(edicao) || edicao <= 0) {
    throw new CodigoEventoInvalidoError(`edição "${partes.edicao}"`);
  }
  return `${sigla}_${polo}_${edicao}`;
}

export function partesDoCodigo(codigo: string): PartesCodigo | null {
  const encontrado = CODIGO.exec(codigo);
  if (!encontrado) {
    return null;
  }
  const [, sigla, polo, edicao] = encontrado as unknown as [string, string, string, string];
  const numero = Number(edicao);
  return numero > 0 ? { sigla, polo, edicao: numero } : null;
}

/**
 * Lê um código digitado à mão nas planilhas ("asm poa 234", "ASM-POA-0234", "Conf_AM_60 ")
 * e devolve a forma canônica, ou null se não der para interpretar.
 * `aliases` troca siglas antigas ou por extenso pela sigla cadastrada (ex.: CONFRONTO -> CONF).
 */
export function normalizarCodigoEvento(
  texto: string,
  opcoes: { aliases?: Readonly<Record<string, string>> } = {},
): string | null {
  const limpo = semAcento(texto)
    .toUpperCase()
    .trim()
    .replace(/[\s\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const partes = partesDoCodigo(limpo);
  if (!partes) {
    return null;
  }
  const sigla = opcoes.aliases?.[partes.sigla] ?? partes.sigla;
  try {
    return montarCodigoEvento({ ...partes, sigla });
  } catch {
    return null;
  }
}
