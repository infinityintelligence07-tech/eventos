import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/core/logging";
import { mensagemDoErro, RegraDeNegocioError } from "@/fluxos/_base";
import { abrirComprovanteDoStaff, removerComprovante } from "@/fluxos/custos";
import { caminhoDoFormularioDeCusto } from "@/modules/custos";

import { respostaDoArquivo } from "../../../_servidor/resposta-do-arquivo";
import { staffDaSessao, veioDoProprioSite } from "../../../_servidor/sessao";

// A pessoa abre ou remove um comprovante dela. O id vem da URL, então a conferência é sempre "este anexo é da pessoa
// da sessão e deste evento": trocar o id não abre anexo de outra pessoa (responde 404, como se não existisse).

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ eventoId: string; comprovanteId: string }> };

export async function GET(request: NextRequest, { params }: Contexto): Promise<NextResponse> {
  const { eventoId, comprovanteId } = await params;
  const sessao = await staffDaSessao();
  if (!sessao.ok) {
    if (sessao.motivo === "NAO_E_STAFF") return respostaDoArquivo(null);
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("proximo", caminhoDoFormularioDeCusto(eventoId));
    return NextResponse.redirect(login, { status: 302, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return respostaDoArquivo(await abrirComprovanteDoStaff(eventoId, comprovanteId, sessao.ator.pessoaId));
  } catch (erro: unknown) {
    logger.error({ componente: "solicitar-custo", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao abrir o comprovante do staff");
    return new NextResponse("Não foi possível abrir o comprovante agora. Tente de novo.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: NextRequest, { params }: Contexto): Promise<NextResponse> {
  const resposta = (corpo: { ok: true } | { ok: false; mensagem: string }, status = 200) => NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
  if (!veioDoProprioSite(request)) return resposta({ ok: false, mensagem: "Pedido recusado." }, 403);
  const sessao = await staffDaSessao();
  if (!sessao.ok) return resposta({ ok: false, mensagem: sessao.mensagem }, sessao.motivo === "SEM_SESSAO" ? 401 : 403);

  const { eventoId, comprovanteId } = await params;
  try {
    await removerComprovante({ eventoId, comprovanteId }, sessao.ator, new Date());
    revalidatePath(caminhoDoFormularioDeCusto(eventoId));
    return resposta({ ok: true });
  } catch (erro: unknown) {
    if (erro instanceof RegraDeNegocioError) return resposta({ ok: false, mensagem: erro.mensagem }, 422);
    logger.error({ componente: "solicitar-custo", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao remover o comprovante do staff");
    return resposta({ ok: false, mensagem: mensagemDoErro(erro) }, 500);
  }
}
