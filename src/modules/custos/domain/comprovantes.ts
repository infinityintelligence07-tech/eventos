// Comprovantes anexados à solicitação de custo (docs/08 §11.4). Regras puras: limites, tipo pelo conteúdo do
// arquivo e o nome do objeto no armazenamento. Quem pode anexar e quando fica no serviço (usa o prazo).

/** No máximo três arquivos por solicitação. */
export const MAXIMO_DE_COMPROVANTES = 3;

/** 8 MB por arquivo (abaixo do limite de 10 MB que o Next aplica ao corpo das requisições que passam pelo middleware). */
export const TAMANHO_MAXIMO_DO_COMPROVANTE = 8 * 1024 * 1024;

/** Valores do CHECK comprovante_custo_tipo_check. */
export const TIPOS_DE_COMPROVANTE = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type TipoDeComprovante = (typeof TIPOS_DE_COMPROVANTE)[number];

const EXTENSAO: Record<TipoDeComprovante, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

const comeca = (bytes: Uint8Array, assinatura: number[], desde = 0) => assinatura.every((byte, indice) => bytes[desde + indice] === byte);

/**
 * O tipo pelo começo do arquivo (número mágico). O Content-Type e a extensão vêm do navegador e não valem como
 * prova: um HTML renomeado para .jpg é recusado aqui. Nulo = não é JPEG, PNG, WebP nem PDF.
 */
export function tipoPelosBytes(bytes: Uint8Array): TipoDeComprovante | null {
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF....WEBP
  if (comeca(bytes, [0x52, 0x49, 0x46, 0x46]) && comeca(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  // %PDF-
  if (comeca(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type RecusaDoArquivo = "VAZIO" | "GRANDE_DEMAIS" | "TIPO_NAO_ACEITO";

/** Confere tamanho e tipo. O tamanho é o do conteúdo recebido, não o que o navegador declarou. */
export function conferirArquivo(bytes: Uint8Array): { tipo: TipoDeComprovante } | { recusa: RecusaDoArquivo } {
  if (bytes.byteLength === 0) return { recusa: "VAZIO" };
  if (bytes.byteLength > TAMANHO_MAXIMO_DO_COMPROVANTE) return { recusa: "GRANDE_DEMAIS" };
  const tipo = tipoPelosBytes(bytes);
  return tipo ? { tipo } : { recusa: "TIPO_NAO_ACEITO" };
}

export function mensagemDaRecusa(recusa: RecusaDoArquivo): string {
  switch (recusa) {
    case "VAZIO":
      return "O arquivo está vazio. Escolha outro.";
    case "GRANDE_DEMAIS":
      return "O arquivo passa de 8 MB. Envie uma foto menor ou um PDF mais leve.";
    case "TIPO_NAO_ACEITO":
      return "Envie uma foto (JPG, PNG ou WebP) ou um PDF.";
    default: {
      const desconhecida: never = recusa;
      throw new Error(`recusa desconhecida: ${String(desconhecida)}`);
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Nome do objeto no armazenamento: só ids gerados no servidor e a extensão do tipo conferido. Nada do nome original
 * entra no caminho.
 */
export function chaveDoComprovante({ eventoId, id, tipo }: { eventoId: string; id: string; tipo: TipoDeComprovante }): string {
  if (!UUID.test(eventoId) || !UUID.test(id)) throw new Error("comprovante: id inválido para a chave do arquivo");
  return `custos/${eventoId}/${id}.${EXTENSAO[tipo]}`;
}

/**
 * O nome que a pessoa deu ao arquivo, só para mostrar na tela: sem pasta, sem caracteres de controle e com até 120
 * caracteres. Vazio vira "comprovante".
 */
export function nomeParaMostrar(nomeOriginal: string, tipo: TipoDeComprovante): string {
  const semPasta = nomeOriginal.split(/[\\/]/).pop() ?? "";
  const limpo = semPasta.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  const nome = limpo.replace(/^\.+/, "").slice(0, 120).trim();
  return nome || `comprovante.${EXTENSAO[tipo]}`;
}

/** "1,2 MB", "340 kB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} kB`;
}
