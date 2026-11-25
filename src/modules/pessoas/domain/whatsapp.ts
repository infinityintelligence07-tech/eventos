// Link "clique para conversar" do WhatsApp (https://wa.me/<número>?text=<mensagem>): abre a conversa com a pessoa já
// com o texto escrito. Quem aperta enviar é o time: o sistema não envia nem sabe se a mensagem saiu.
// Puro: quem lê o telefone do cadastro e decide quem pode receber o link é o fluxo.

const PAIS = "55";

// DDDs em uso (Anatel). O 55 (interior do RS) existe: por isso o país só é reconhecido pelo "+", pelo "00" ou pelo tamanho.
const DDDS = new Set(
  [
    [11, 19],
    [21, 22],
    [24, 24],
    [27, 28],
    [31, 35],
    [37, 38],
    [41, 49],
    [51, 51],
    [53, 55],
    [61, 69],
    [71, 71],
    [73, 75],
    [77, 77],
    [79, 79],
    [81, 89],
    [91, 99],
  ].flatMap(([de, ate]) => Array.from({ length: ate! - de! + 1 }, (_, indice) => String(de! + indice))),
);

/**
 * Telefone brasileiro do cadastro (digitado à mão: com ou sem +55, com máscara, com zero na frente do DDD) no formato
 * que o wa.me pede: só dígitos, com país e DDD. Nulo quando não dá para ter certeza do número (sem DDD, de outro país,
 * dois telefones no mesmo campo): melhor não oferecer o link do que abrir a conversa com outra pessoa.
 */
export function telefoneParaWhatsApp(telefone: string | null | undefined): string | null {
  const texto = telefone?.trim();
  if (!texto) return null;

  let digitos = texto.replace(/\D/g, "");
  let comPais = texto.startsWith("+");
  if (!comPais && digitos.startsWith("00")) {
    comPais = true;
    digitos = digitos.slice(2);
  }
  if (comPais) {
    if (!digitos.startsWith(PAIS)) return null;
    digitos = digitos.slice(PAIS.length);
  }
  // Zero de longa distância na frente do DDD: "(011) 99999-8888".
  digitos = digitos.replace(/^0/, "");
  // Sem "+": 12 ou 13 dígitos começando por 55 já trazem o país; 10 ou 11 são DDD + número.
  if (!comPais && (digitos.length === 12 || digitos.length === 13) && digitos.startsWith(PAIS)) digitos = digitos.slice(PAIS.length);

  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  if (!DDDS.has(ddd)) return null;
  // Celular: 9 dígitos, começando por 9.
  if (/^9\d{8}$/.test(numero)) return `${PAIS}${ddd}${numero}`;
  if (!/^[2-9]\d{7}$/.test(numero)) return null;
  // 8 dígitos: fixo (2 a 5) segue como está; 6 a 9 é celular anotado antes do nono dígito, que todo celular ganhou.
  return /^[6-9]/.test(numero) ? `${PAIS}${ddd}9${numero}` : `${PAIS}${ddd}${numero}`;
}

/**
 * Endereço que abre a conversa com a pessoa (app no celular, WhatsApp Web no computador) com a mensagem já escrita.
 * Nulo = sem telefone válido. O telefone vai só neste endereço: não o mostre em tela, log ou histórico.
 */
export function linkDoWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const numero = telefoneParaWhatsApp(telefone);
  if (!numero) return null;
  // Metade de emoji solta (texto cortado no meio) faria o encodeURIComponent lançar erro: vira "�".
  const texto = mensagem.replace(/\p{Cs}/gu, "�");
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
