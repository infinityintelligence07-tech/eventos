import { describe, expect, it } from "vitest";

import { gerarCopy } from "@/modules/comunicacao/domain/copy";

import { dadosDoCustoReprovado, mensagemDeCustoAprovado, MODELO_PADRAO_DE_CUSTO_REPROVADO, primeiroNome } from "../mensagens";

describe("mensagem de custo aprovado", () => {
  it("leva o primeiro nome, o evento, o protocolo e o valor aprovado", () => {
    expect(mensagemDeCustoAprovado({ nome: "Ana Paula Souza", evento: "ASM_AM_901", protocolo: "STF-202612-0007", totalCentavos: 48630 })).toBe(
      [
        "Olá, Ana!",
        "",
        "Sua solicitação de custo do evento ASM_AM_901 foi aprovada.",
        "",
        "Protocolo: STF-202612-0007",
        "Valor aprovado: R$ 486,30",
        "",
        "O valor seguiu para o financeiro fazer o pagamento. Qualquer dúvida, fale com o time de eventos.",
      ].join("\n"),
    );
  });

  it("formata milhar e centavos em reais, com espaço comum (o texto é colado no WhatsApp)", () => {
    const texto = mensagemDeCustoAprovado({ nome: "Bia", evento: "CONF_POA_61", protocolo: "STF-202612-0008", totalCentavos: 153735 });
    expect(texto).toContain("Valor aprovado: R$ 1.537,35");
    expect(texto).not.toMatch(/[  ]/);
  });

  it("sem nome, cumprimenta sem inventar um", () => {
    expect(mensagemDeCustoAprovado({ nome: "  ", evento: "MC_CPS_CAMPINAS", protocolo: "STF-202612-0009", totalCentavos: 0 }).split("\n")[0]).toBe("Olá!");
    expect(primeiroNome("  Carlos   Eduardo ")).toBe("Carlos");
  });
});

describe("copy de custo reprovado", () => {
  const dados = dadosDoCustoReprovado({
    nome: "Ana Paula Souza",
    evento: "ASM_AM_901",
    protocolo: "STF-202612-0007",
    totalCentavos: 48630,
    motivo: "O comprovante do pedágio está ilegível.",
    saudacao: "Boa tarde",
    linkCustos: null,
  });

  it("o texto padrão sai pronto, com o primeiro nome, o evento, o protocolo e o motivo", () => {
    const copy = gerarCopy(MODELO_PADRAO_DE_CUSTO_REPROVADO, dados);
    expect(copy.pronta).toBe(true);
    expect(copy.texto).toBe(
      [
        "Boa tarde, Ana!",
        "",
        "Sua solicitação de custo do evento ASM_AM_901 não foi aprovada.",
        "",
        "Protocolo: STF-202612-0007",
        "Motivo: O comprovante do pedágio está ilegível.",
        "",
        "Corrija e envie de novo pelo formulário de custos. Qualquer dúvida, fale com o time de eventos.",
      ].join("\n"),
    );
  });

  it("um modelo editado pode usar o valor; campo sem dado fica à vista, sem inventar", () => {
    expect(gerarCopy("{{custo.protocolo}}: {{custo.valor}}", dados).texto).toBe("STF-202612-0007: R$ 486,30");
    const semMotivo = gerarCopy("Motivo: {{custo.motivo}}", { ...dados, custo: { ...dados.custo, motivo: null } });
    expect(semMotivo.pronta).toBe(false);
    expect(semMotivo.faltando).toEqual(["custo.motivo"]);
  });
});
