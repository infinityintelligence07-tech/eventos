import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PERMISSOES, type Permissao } from "@/core/autorizacao";

// Toda server action exportada passa por executarAcao (ou executarLeitura, nas prévias) com a permissão da docs/09 §4.3.
const ESPERADO: Record<string, Record<string, Permissao>> = {
  "eventos/[eventoId]/acoes.ts": { salvarDadosDoEvento: "evento.editar" },
  "eventos/[eventoId]/escala/acoes.ts": {
    confirmarVagas: "escala.montar",
    alterarVagas: "escala.montar",
    definirVagaDigitada: "escala.montar",
    adicionarVagaManual: "escala.montar",
    removerVagaManual: "escala.montar",
    porNaVaga: "escala.montar",
    tirarDaVaga: "escala.montar",
    atualizarConvocacao: "escala.montar",
    enviarParaAprovacao: "escala.montar",
    registrarRespostaDoStaff: "escala.registrar_resposta",
    aprovarEscala: "escala.aprovar",
    devolverEscala: "escala.aprovar",
    reabrirEscala: "escala.reabrir",
  },
  "escalas/aprovacao/acoes.ts": { aprovarEscala: "escala.aprovar", devolverEscala: "escala.aprovar" },
  "eventos/[eventoId]/comunicacao/acoes.ts": { marcarCopyComoEnviada: "comunicacao.enviar" },
  "disponibilidade/nova/acoes.ts": { abrirEnqueteAcao: "disponibilidade.gerir" },
  "disponibilidade/[enqueteId]/acoes.ts": {
    encerrarEnqueteAcao: "disponibilidade.gerir",
    reabrirEnqueteAcao: "disponibilidade.gerir",
    registrarRespostaAcao: "disponibilidade.registrar_resposta",
  },
  "pessoas/[pessoaId]/acoes.ts": {
    salvarPerfilAcao: "pessoas.editar",
    definirFuncoesAcao: "pessoas.editar",
    salvarVeiculoAcao: "pessoas.editar",
    salvarCoordenadasAcao: "pessoas.editar",
  },
  "logistica/acoes.ts": {
    registrarPedidoDeVooAcao: "logistica.gerir",
    alterarPedidoAcao: "logistica.gerir",
    cancelarPedidoAcao: "logistica.gerir",
    registrarRetornoDeVooAcao: "logistica.registrar_retorno_sdc",
    registrarRetornoDeHospedagemAcao: "logistica.registrar_retorno_sdc",
    criarHospedagemAcao: "logistica.gerir",
    alterarHospedagemAcao: "logistica.gerir",
    registrarPedidoDeHospedagemAcao: "logistica.gerir",
    adicionarQuartoAcao: "logistica.gerir",
    removerQuartoAcao: "logistica.gerir",
    porNoQuartoAcao: "logistica.gerir",
    tirarDoQuartoAcao: "logistica.gerir",
    aplicarRoomingSugeridoAcao: "logistica.gerir",
    criarCaronaAcao: "logistica.gerir",
    removerCaronaAcao: "logistica.gerir",
    definirCaronaAcao: "logistica.gerir",
    tirarDaCaronaAcao: "logistica.gerir",
  },
  "custos/acoes.ts": {
    registrarSolicitacaoAcao: "custos.registrar",
    corrigirSolicitacaoAcao: "custos.registrar",
    calcularPreviaAcao: "custos.registrar",
    aprovarSolicitacaoAcao: "custos.auditar",
    reprovarSolicitacaoAcao: "custos.auditar",
    reabrirAuditoriaAcao: "custos.reabrir_auditoria",
  },
  "configuracoes/locais/acoes.ts": { salvarLocalAcao: "config.locais", arquivarLocalAcao: "config.locais" },
  "configuracoes/modelos-de-copy/acoes.ts": {
    salvarModeloAcao: "config.modelos_copy",
    definirModeloAtivoAcao: "config.modelos_copy",
    previaDoModeloAcao: "config.modelos_copy",
    salvarLinkDeCustosAcao: "config.link_custos",
  },
  "configuracoes/vagas/acoes.ts": { salvarRegraDeVagas: "config.regras_vagas", recalcularVagasDoTipo: "config.regras_vagas" },
  "configuracoes/regras-de-custo/acoes.ts": { criarVigenciaDeRegraAcao: "config.regras_custo", desativarRegraAcao: "config.regras_custo" },
};

const RAIZ = path.resolve(import.meta.dirname, "..");

function permissoesDasActions(arquivo: string): Record<string, string | null> {
  const texto = readFileSync(path.join(RAIZ, arquivo), "utf8");
  const partes = texto.split(/^(?=export async function )/m).slice(1);
  return Object.fromEntries(
    partes.map((parte) => {
      const nome = /^export async function (\w+)/.exec(parte)![1]!;
      const permissao =
        /executarAcao\(\s*form,[\s\S]*?,\s*"([a-z_]+\.[a-z_]+)",\s*async/.exec(parte)?.[1] ?? /executarLeitura\(\s*"([a-z_]+\.[a-z_]+)"/.exec(parte)?.[1] ?? null;
      return [nome, permissao];
    }),
  );
}

describe("server actions com permissão (docs/09 §4.3)", () => {
  const arquivos = globSync("**/acoes.ts", { cwd: RAIZ }).filter((arquivo) => readFileSync(path.join(RAIZ, arquivo), "utf8").includes('"use server"'));

  it("os 13 arquivos de actions são os da tabela", () => {
    expect(arquivos.sort()).toEqual(Object.keys(ESPERADO).sort());
  });

  it.each(Object.keys(ESPERADO))("%s: toda action exportada exige a permissão da matriz", (arquivo) => {
    const encontradas = permissoesDasActions(arquivo);
    expect(encontradas).toEqual(ESPERADO[arquivo]);
    for (const permissao of Object.values(encontradas)) expect(PERMISSOES).toContain(permissao);
  });

  it("58 actions no total", () => {
    expect(Object.values(ESPERADO).flatMap(Object.keys)).toHaveLength(58);
  });
});
