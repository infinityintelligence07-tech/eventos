import { describe, expect, it } from "vitest";

import { type AcaoDeAuditoria, exigeMotivo, type SituacaoDaSolicitacao, textoDoFinanceiro, transicaoDaAuditoria } from "../auditoria";
import { corrigirSolicitacaoSchema, registrarSolicitacaoSchema, unidadesDoTexto } from "../schemas";

const PENDENTE: SituacaoDaSolicitacao = { auditoria: "PENDENTE", financeiro: "AGUARDANDO_AUDITORIA" };
const APROVADA: SituacaoDaSolicitacao = { auditoria: "APROVADO", financeiro: "AGUARDANDO_PAGAMENTO" };
const PAGA: SituacaoDaSolicitacao = { auditoria: "APROVADO", financeiro: "PAGO" };
const REPROVADA: SituacaoDaSolicitacao = { auditoria: "REPROVADO", financeiro: "AGUARDANDO_AUDITORIA" };

describe("máquina da auditoria (§4.4)", () => {
  it.each<[SituacaoDaSolicitacao, AcaoDeAuditoria, ReturnType<typeof transicaoDaAuditoria>]>([
    [PENDENTE, "APROVAR", { para: APROVADA }],
    [PENDENTE, "REPROVAR", { para: REPROVADA }],
    [PENDENTE, "CORRIGIR", { erro: "TRANSICAO_INVALIDA" }],
    [PENDENTE, "REABRIR", { erro: "TRANSICAO_INVALIDA" }],
    [APROVADA, "APROVAR", { erro: "TRANSICAO_INVALIDA" }],
    [APROVADA, "REPROVAR", { erro: "TRANSICAO_INVALIDA" }],
    [APROVADA, "REABRIR", { para: PENDENTE }],
    [PAGA, "REABRIR", { erro: "JA_NO_FINANCEIRO" }],
    [REPROVADA, "CORRIGIR", { para: PENDENTE }],
    [REPROVADA, "APROVAR", { erro: "TRANSICAO_INVALIDA" }],
    [REPROVADA, "REABRIR", { erro: "TRANSICAO_INVALIDA" }],
  ])("%o + %s → %o", (atual, acao, esperado) => {
    expect(transicaoDaAuditoria(atual, acao)).toEqual(esperado);
  });

  it("motivo obrigatório para reprovar e para aprovar com crítico (§11.1)", () => {
    expect(exigeMotivo("REPROVAR", "NENHUM")).toBe(true);
    expect(exigeMotivo("APROVAR", "CRITICO")).toBe(true);
    expect(exigeMotivo("APROVAR", "ALERTA")).toBe(false);
    expect(exigeMotivo("APROVAR", "NENHUM")).toBe(false);
  });

  it("texto do financeiro", () => {
    expect(textoDoFinanceiro("PAGO", "2026-11-20")).toBe("Pago em 20/11");
    expect(textoDoFinanceiro("PENDENTE_CADASTRO", null)).toBe("Cadastro pendente (sem PIX)");
  });
});

describe("schemas de custos", () => {
  it.each<[string, number, number | null]>([
    ["412,5", 1, 4125],
    ["1.234,5", 1, 12345],
    ["12.5", 1, 125],
    ["12,55", 1, null],
    ["2,5", 2, 250],
    ["", 1, null],
  ])("unidadesDoTexto(%s, %s) = %s", (texto, casas, esperado) => {
    expect(unidadesDoTexto(texto, casas)).toBe(esperado);
  });

  const ids = { eventoId: "7e570000-0000-7000-8000-000000000010", pessoaId: "7e570000-0000-7000-8000-000000000011" };

  it("registrar: converte km, consumo e dinheiro; ida e volta pela caixa marcada", () => {
    const lido = registrarSolicitacaoSchema.parse({
      ...ids,
      deslocamentos: [{ origem: "Canoas", destino: "Porto Alegre", idaVolta: "on", km: "32,4", consumoKmL: "10,5", precoLitroCentavos: "6,19" }],
      itens: [{ categoria: "ALIMENTACAO", descricao: "Alimentação", quantidade: "1", valorCentavos: "270,00" }],
    });
    expect(lido.deslocamentos[0]).toEqual({
      origem: "Canoas",
      destino: "Porto Alegre",
      idaVolta: true,
      km: 32.4,
      consumoKmL: 10.5,
      precoLitroCentavos: 619,
      pedagioCentavos: 0,
    });
    expect(lido.itens[0]).toMatchObject({ quantidade: 1, valorCentavos: 27000 });
  });

  it("registrar sem nenhuma linha é recusado; consumo zero é recusado", () => {
    expect(registrarSolicitacaoSchema.safeParse(ids).success).toBe(false);
    const zero = registrarSolicitacaoSchema.safeParse({
      ...ids,
      deslocamentos: [{ origem: "A", destino: "B", km: "10", consumoKmL: "0", precoLitroCentavos: "6" }],
    });
    expect(zero.success).toBe(false);
    expect(zero.error?.issues[0]?.path).toEqual(["deslocamentos", 0, "consumoKmL"]);
  });

  it("corrigir exige a versão", () => {
    expect(
      corrigirSolicitacaoSchema.safeParse({ solicitacaoId: ids.eventoId, itens: [{ categoria: "OUTRO", descricao: "x", quantidade: "1", valorCentavos: "1" }] }).success,
    ).toBe(false);
  });
});
