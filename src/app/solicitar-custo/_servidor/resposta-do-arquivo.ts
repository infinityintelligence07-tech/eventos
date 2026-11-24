import { NextResponse } from "next/server";

import type { ComprovanteAberto } from "@/fluxos/custos";

const SEM_GUARDAR = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/**
 * Entrega o comprovante a quem já passou pela conferência de acesso: redireciona para o link de curta duração do
 * armazenamento ou, sem link (modo local), devolve o conteúdo. Nulo = 404, igual para "não existe" e "não é seu".
 */
export function respostaDoArquivo(aberto: ComprovanteAberto | null): NextResponse {
  if (!aberto) return new NextResponse("Comprovante não encontrado.", { status: 404, headers: SEM_GUARDAR });
  if (aberto.forma === "LINK") return NextResponse.redirect(aberto.url, { status: 302, headers: SEM_GUARDAR });
  return new NextResponse(aberto.conteudo as BodyInit, {
    status: 200,
    headers: {
      ...SEM_GUARDAR,
      // O tipo é o conferido pelos bytes no envio; nosniff impede o navegador de tratar o arquivo como outra coisa.
      "Content-Type": aberto.tipo,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(aberto.nome)}`,
      "Content-Length": String(aberto.conteudo.byteLength),
    },
  });
}
