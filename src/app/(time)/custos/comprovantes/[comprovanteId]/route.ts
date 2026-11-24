import { type NextRequest, NextResponse } from "next/server";

import { situacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { respostaDoArquivo } from "@/app/solicitar-custo/_servidor/resposta-do-arquivo";
import { logger } from "@/core/logging";
import { abrirComprovanteParaOTime } from "@/fluxos/custos";

// "Ver comprovante" da auditoria (doc 08 §11.2). Route handler não passa pelo layout do (time): confere o ator aqui.
// Vale o mesmo acesso da tela Custos (qualquer perfil do Eventos). O visitante da demo não abre anexo: é documento
// pessoal de quem enviou.

export const dynamic = "force-dynamic";

const SEM_GUARDAR = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ comprovanteId: string }> }): Promise<NextResponse> {
  const atual = await situacaoDoAtor();
  if (atual.situacao === "SEM_SESSAO") {
    const entrada = new URL(atual.destino, request.nextUrl.origin);
    entrada.searchParams.set("proximo", "/custos");
    return NextResponse.redirect(entrada, { status: 302, headers: SEM_GUARDAR });
  }
  if (atual.situacao !== "OK" || atual.ator.origem === "DEMO") return new NextResponse("Sem acesso a este comprovante.", { status: 403, headers: SEM_GUARDAR });

  const { comprovanteId } = await params;
  try {
    return respostaDoArquivo(await abrirComprovanteParaOTime(comprovanteId));
  } catch (erro: unknown) {
    logger.error({ componente: "custos", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao abrir o comprovante na auditoria");
    return new NextResponse("Não foi possível abrir o comprovante agora. Tente de novo.", { status: 502, headers: SEM_GUARDAR });
  }
}
