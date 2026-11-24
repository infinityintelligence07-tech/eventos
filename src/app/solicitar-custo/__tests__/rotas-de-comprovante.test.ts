import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegraDeNegocioError } from "@/fluxos/_base";

// As rotas de comprovante do staff e a do time: quem pode chamar, o que volta em cada recusa e como o arquivo é
// entregue. As regras de negócio (prazo, escala, limite, dono do anexo) estão nos testes de integração do fluxo.

const sessao = vi.hoisted(() => ({ atual: null as unknown }));
const fluxo = vi.hoisted(() => ({
  anexar: vi.fn(),
  remover: vi.fn(),
  abrirDoStaff: vi.fn(),
  abrirParaOTime: vi.fn(),
}));
const time = vi.hoisted(() => ({ situacao: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../_servidor/sessao", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), staffDaSessao: async () => sessao.atual }));
vi.mock("@/app/(time)/_servidor/usuario-atual", () => ({ situacaoDoAtor: async () => time.situacao, identidadeDaSessao: async () => null }));
vi.mock("@/fluxos/custos", () => ({
  anexarComprovante: fluxo.anexar,
  removerComprovante: fluxo.remover,
  abrirComprovanteDoStaff: fluxo.abrirDoStaff,
  abrirComprovanteParaOTime: fluxo.abrirParaOTime,
}));

const EVENTO = "0192f0c0-0000-7000-8000-000000000001";
const COMPROVANTE = "7f1f2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const ATOR = { usuarioId: "u", pessoaId: "p", origem: "SESSAO" as const };
const BASE = `http://eventos.test/solicitar-custo/${EVENTO}/comprovantes`;
const PDF = new Uint8Array(Buffer.from("%PDF-1.7 recibo"));

function pedidoDeEnvio(arquivo: File | null, cabecalhos: Record<string, string> = {}) {
  const corpo = new FormData();
  if (arquivo) corpo.append("arquivo", arquivo, arquivo.name);
  return new NextRequest(BASE, { method: "POST", body: corpo, headers: { "sec-fetch-site": "same-origin", ...cabecalhos } });
}

beforeEach(() => {
  sessao.atual = { ok: true, ator: ATOR };
  time.situacao = { situacao: "OK", ator: { ...ATOR, origem: "SESSAO", perfis: ["EVENTOS_TIME"] } };
  for (const funcao of Object.values(fluxo)) funcao.mockReset();
});

describe("POST /solicitar-custo/[eventoId]/comprovantes", () => {
  const enviar = async (pedido: NextRequest) => (await import("../[eventoId]/comprovantes/route")).POST(pedido, { params: Promise.resolve({ eventoId: EVENTO }) });

  it("anexa o arquivo da pessoa da sessão e devolve só id, nome, tipo e tamanho", async () => {
    fluxo.anexar.mockResolvedValue({ id: COMPROVANTE, nome: "recibo.pdf", tipo: "application/pdf", tamanhoBytes: PDF.byteLength, criadoEm: new Date(), chave: "custos/segredo" });
    const resposta = await enviar(pedidoDeEnvio(new File([PDF], "recibo.pdf", { type: "image/png" })));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, comprovante: { id: COMPROVANTE, nome: "recibo.pdf", tipo: "application/pdf", tamanhoBytes: PDF.byteLength } });
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const [entrada, ator] = fluxo.anexar.mock.calls[0]!;
    // O evento vem da URL e o conteúdo, do arquivo: nenhum id de pessoa sai do pedido.
    expect(entrada).toEqual({ eventoId: EVENTO, nome: "recibo.pdf", conteudo: PDF });
    expect(ator).toBe(ATOR);
  });

  it("recusa pedido de outro site, sem sessão e de quem não é staff, sem ler o arquivo", async () => {
    expect((await enviar(pedidoDeEnvio(new File([PDF], "x.pdf"), { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await enviar(pedidoDeEnvio(new File([PDF], "x.pdf"), { "sec-fetch-site": "same-site" }))).status).toBe(403);
    sessao.atual = { ok: false, motivo: "SEM_SESSAO", mensagem: "Sua sessão terminou. Entre de novo." };
    const semSessao = await enviar(pedidoDeEnvio(new File([PDF], "x.pdf")));
    expect([semSessao.status, await semSessao.json()]).toEqual([401, { ok: false, mensagem: "Sua sessão terminou. Entre de novo." }]);
    sessao.atual = { ok: false, motivo: "NAO_E_STAFF", mensagem: "Seu usuário não está no cadastro de staff." };
    expect((await enviar(pedidoDeEnvio(new File([PDF], "x.pdf")))).status).toBe(403);
    expect(fluxo.anexar).not.toHaveBeenCalled();
  });

  it("recusa corpo declarado acima do limite, arquivo acima de 8 MB e pedido sem arquivo", async () => {
    const declarado = await enviar(pedidoDeEnvio(new File([PDF], "x.pdf"), { "content-length": String(9 * 1024 * 1024) }));
    expect([declarado.status, (await declarado.json()).mensagem]).toEqual([413, "O arquivo passa de 8 MB. Envie uma foto menor ou um PDF mais leve."]);
    expect((await enviar(pedidoDeEnvio(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "enorme.pdf")))).status).toBe(413);
    const semArquivo = await enviar(pedidoDeEnvio(null));
    expect([semArquivo.status, (await semArquivo.json()).mensagem]).toEqual([400, "Escolha um arquivo para anexar."]);
    expect(fluxo.anexar).not.toHaveBeenCalled();
  });

  it("recusa de regra vai para a pessoa; falha inesperada vira mensagem genérica, sem detalhe do armazenamento", async () => {
    fluxo.anexar.mockRejectedValueOnce(new RegraDeNegocioError("Cada solicitação aceita até 3 comprovantes. Remova um para anexar outro."));
    const regra = await enviar(pedidoDeEnvio(new File([PDF], "x.pdf")));
    expect([regra.status, (await regra.json()).mensagem]).toEqual([422, "Cada solicitação aceita até 3 comprovantes. Remova um para anexar outro."]);

    fluxo.anexar.mockRejectedValueOnce(new Error("PUT https://projeto.storage.supabase.co/x?X-Amz-Signature=abc falhou"));
    const falha = await enviar(pedidoDeEnvio(new File([PDF], "x.pdf")));
    expect(falha.status).toBe(500);
    expect(JSON.stringify(await falha.json())).not.toMatch(/supabase|Signature/);
  });
});

describe("GET e DELETE /solicitar-custo/[eventoId]/comprovantes/[comprovanteId]", () => {
  const contexto = { params: Promise.resolve({ eventoId: EVENTO, comprovanteId: COMPROVANTE }) };
  const rota = () => import("../[eventoId]/comprovantes/[comprovanteId]/route");
  const abrir = async () => (await rota()).GET(new NextRequest(`${BASE}/${COMPROVANTE}`), contexto);
  const remover = async (cabecalhos: Record<string, string> = { "sec-fetch-site": "same-origin" }) => (await rota()).DELETE(new NextRequest(`${BASE}/${COMPROVANTE}`, { method: "DELETE", headers: cabecalhos }), contexto);

  it("abre pelo link de curta duração do armazenamento, sem guardar em cache nem mandar o referer", async () => {
    fluxo.abrirDoStaff.mockResolvedValue({ forma: "LINK", url: "https://armazenamento.exemplo.test/objeto?X-Amz-Signature=abc" });
    const resposta = await abrir();
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get("location")).toBe("https://armazenamento.exemplo.test/objeto?X-Amz-Signature=abc");
    expect(resposta.headers.get("cache-control")).toBe("private, no-store");
    expect(resposta.headers.get("referrer-policy")).toBe("no-referrer");
    // A conferência usa a pessoa da sessão, o evento e o id da URL.
    expect(fluxo.abrirDoStaff).toHaveBeenCalledWith(EVENTO, COMPROVANTE, "p");
  });

  it("no modo local serve o conteúdo com o tipo conferido no envio e nosniff", async () => {
    fluxo.abrirDoStaff.mockResolvedValue({ forma: "CONTEUDO", conteudo: PDF, tipo: "application/pdf", nome: "recibo do posto.pdf" });
    const resposta = await abrir();
    expect(resposta.status).toBe(200);
    expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(PDF);
    expect(resposta.headers.get("content-type")).toBe("application/pdf");
    expect(resposta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(resposta.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''recibo%20do%20posto.pdf");
  });

  it("anexo que não existe ou não é da pessoa: 404 igual nos dois casos; sem sessão vai para o login", async () => {
    fluxo.abrirDoStaff.mockResolvedValue(null);
    const naoEncontrado = await abrir();
    expect([naoEncontrado.status, await naoEncontrado.text()]).toEqual([404, "Comprovante não encontrado."]);

    sessao.atual = { ok: false, motivo: "NAO_E_STAFF", mensagem: "x" };
    expect((await abrir()).status).toBe(404);
    sessao.atual = { ok: false, motivo: "SEM_SESSAO", mensagem: "x" };
    const semSessao = await abrir();
    expect(semSessao.status).toBe(302);
    expect(semSessao.headers.get("location")).toBe(`http://eventos.test/login?proximo=${encodeURIComponent(`/solicitar-custo/${EVENTO}`)}`);
    expect(fluxo.abrirDoStaff).toHaveBeenCalledTimes(1);
  });

  it("remover: só da própria página e com sessão; a recusa de regra chega à pessoa", async () => {
    fluxo.remover.mockResolvedValue(undefined);
    const ok = await remover();
    expect([ok.status, await ok.json()]).toEqual([200, { ok: true }]);
    expect(fluxo.remover).toHaveBeenCalledWith({ eventoId: EVENTO, comprovanteId: COMPROVANTE }, ATOR, expect.any(Date));

    expect((await remover({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    sessao.atual = { ok: false, motivo: "SEM_SESSAO", mensagem: "Sua sessão terminou. Entre de novo." };
    expect((await remover()).status).toBe(401);
    expect(fluxo.remover).toHaveBeenCalledTimes(1);

    sessao.atual = { ok: true, ator: ATOR };
    fluxo.remover.mockRejectedValueOnce(new RegraDeNegocioError("Comprovante não encontrado. Recarregue a página."));
    const recusa = await remover();
    expect([recusa.status, await recusa.json()]).toEqual([422, { ok: false, mensagem: "Comprovante não encontrado. Recarregue a página." }]);
  });
});

describe("GET /custos/comprovantes/[comprovanteId] (auditoria)", () => {
  const abrir = async () =>
    (await import("@/app/(time)/custos/comprovantes/[comprovanteId]/route")).GET(new NextRequest(`http://eventos.test/custos/comprovantes/${COMPROVANTE}`), { params: Promise.resolve({ comprovanteId: COMPROVANTE }) });

  it("quem tem perfil do Eventos abre", async () => {
    fluxo.abrirParaOTime.mockResolvedValue({ forma: "LINK", url: "https://armazenamento.exemplo.test/objeto" });
    const resposta = await abrir();
    expect([resposta.status, resposta.headers.get("location")]).toEqual([302, "https://armazenamento.exemplo.test/objeto"]);
    expect(fluxo.abrirParaOTime).toHaveBeenCalledWith(COMPROVANTE);
  });

  it("sem sessão vai para a entrada; sem perfil, sem cadastro e o visitante da demo não abrem", async () => {
    time.situacao = { situacao: "SEM_SESSAO", destino: "/login" };
    const semSessao = await abrir();
    expect([semSessao.status, semSessao.headers.get("location")]).toEqual([302, "http://eventos.test/login?proximo=%2Fcustos"]);
    for (const situacao of [{ situacao: "SEM_PERFIL", email: "staff@exemplo.test" }, { situacao: "SEM_CADASTRO" }, { situacao: "OK", ator: { ...ATOR, origem: "DEMO", perfis: ["EVENTOS_LIDER"] } }]) {
      time.situacao = situacao;
      expect((await abrir()).status).toBe(403);
    }
    expect(fluxo.abrirParaOTime).not.toHaveBeenCalled();
  });

  it("comprovante inexistente: 404", async () => {
    fluxo.abrirParaOTime.mockResolvedValue(null);
    expect((await abrir()).status).toBe(404);
  });
});
