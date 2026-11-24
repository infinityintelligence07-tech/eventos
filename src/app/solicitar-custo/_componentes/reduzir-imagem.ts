// Reduz a foto no navegador antes de enviar: foto de celular tem 3 a 12 MB, e um comprovante legível cabe em bem
// menos. Poupa o plano de dados de quem envia. Se o navegador não conseguir (formato que ele não abre, canvas
// indisponível), o arquivo vai como está e o servidor decide.

/** Lado maior da imagem depois de reduzida: suficiente para ler um cupom fotografado. */
export const LADO_MAXIMO_DA_IMAGEM = 2000;
const QUALIDADE_DO_JPEG = 0.82;
/** Abaixo disto a foto já é leve: não vale recomprimir (e perder nitidez). */
export const SO_REDUZ_ACIMA_DE = 600 * 1024;

/** Mantém a proporção; nunca aumenta. */
export function dimensoesReduzidas(largura: number, altura: number, ladoMaximo = LADO_MAXIMO_DA_IMAGEM): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo || maior === 0) return { largura, altura };
  const escala = ladoMaximo / maior;
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/** "IMG_1234.HEIC" → "IMG_1234.jpg". */
export function nomeComoJpeg(nome: string): string {
  const semExtensao = nome.replace(/\.[^./\\]+$/, "");
  return `${semExtensao || "comprovante"}.jpg`;
}

export async function reduzirImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.size <= SO_REDUZ_ACIMA_DE) return arquivo;
  try {
    const imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const contexto = tela.getContext("2d");
    if (!contexto) return arquivo;
    // Fundo branco: PNG com transparência viraria preto no JPEG.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, largura, altura);
    contexto.drawImage(imagem, 0, 0, largura, altura);
    imagem.close();
    const reduzida = await new Promise<Blob | null>((resolver) => tela.toBlob(resolver, "image/jpeg", QUALIDADE_DO_JPEG));
    if (!reduzida || reduzida.size >= arquivo.size) return arquivo;
    return new File([reduzida], nomeComoJpeg(arquivo.name), { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}
