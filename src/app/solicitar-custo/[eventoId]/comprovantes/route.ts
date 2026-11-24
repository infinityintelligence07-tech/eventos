import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/core/logging";
import { mensagemDoErro, RegraDeNegocioError } from "@/fluxos/_base";
import { anexarComprovante } from "@/fluxos/custos";
import { caminhoDoFormularioDeCusto, TAMANHO_MAXIMO_DO_COMPROVANTE } from "@/modules/custos";

import { staffDaSessao, veioDoProprioSite } from "../../_servidor/sessao";

// Envio de um comprovante pelo próprio staff (docs/08 §11.4). Rota própria e um arquivo por pedido: server action
// tem limite de 1 MB, e o corpo que passa pelo middleware é cortado em 10 MB. Mesma conferência das ações do staff:
// pessoa da sessão, evento dela e prazo aberto (ou correção permitida).

export const dynamic = "force-dynamic";

export type RespostaDoAnexo = { ok: true; comprovante: { id: string; nome: string; tipo: string; tamanhoBytes: number } } | { ok: false; mensagem: string };

const recusa = (mensagem: string, status: number) => NextResponse.json<RespostaDoAnexo>({ ok: false, mensagem }, { status, headers: { "Cache-Control": "no-store" } });

/** O multipart acrescenta alguns bytes ao arquivo (limites e cabeçalhos da parte). */
const LIMITE_DO_CORPO = TAMANHO_MAXIMO_DO_COMPROVANTE + 64 * 1024;
const MENSAGEM_GRANDE = "O arquivo passa de 8 MB. Envie uma foto menor ou um PDF mais leve.";

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventoId: string }> }): Promise<NextResponse> {
  if (!veioDoProprioSite(request)) return recusa("Pedido recusado.", 403);
  const sessao = await staffDaSessao();
  if (!sessao.ok) return recusa(sessao.mensagem, sessao.motivo === "SEM_SESSAO" ? 401 : 403);

  // Antes de ler o corpo: quem declara mais do que o limite nem é lido.
  if (Number(request.headers.get("content-length") ?? 0) > LIMITE_DO_CORPO) return recusa(MENSAGEM_GRANDE, 413);
  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return recusa("Escolha um arquivo para anexar.", 400);
  if (arquivo.size > TAMANHO_MAXIMO_DO_COMPROVANTE) return recusa(MENSAGEM_GRANDE, 413);

  const { eventoId } = await params;
  try {
    const comprovante = await anexarComprovante({ eventoId, nome: arquivo.name, conteudo: new Uint8Array(await arquivo.arrayBuffer()) }, sessao.ator, new Date());
    revalidatePath(caminhoDoFormularioDeCusto(eventoId));
    const { id, nome, tipo, tamanhoBytes } = comprovante;
    return NextResponse.json<RespostaDoAnexo>({ ok: true, comprovante: { id, nome, tipo, tamanhoBytes } }, { headers: { "Cache-Control": "no-store" } });
  } catch (erro: unknown) {
    if (erro instanceof RegraDeNegocioError) return recusa(erro.mensagem, 422);
    logger.error({ componente: "solicitar-custo", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao anexar o comprovante do staff");
    return recusa(mensagemDoErro(erro), 500);
  }
}
