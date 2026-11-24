import { describe, expect, it } from "vitest";

import { avisoDaResposta, RESPOSTA_GRAVADA } from "../_componentes/aviso";

describe("avisoDaResposta", () => {
  it("não avisa nada antes de um envio (página carregada ou recarregada)", () => {
    expect(avisoDaResposta(null)).toEqual({ tipo: "nenhum" });
  });

  it("abre o pop-up só quando a resposta foi gravada, com o resumo do que ficou marcado", () => {
    expect(avisoDaResposta({ ok: true, podem: 2, total: 5 })).toEqual({
      tipo: "gravada",
      resumo: "Sua resposta: você pode em 2 de 5 eventos. Você pode alterar até a enquete fechar.",
    });
    expect(avisoDaResposta({ ok: true, podem: 1, total: 1 })).toMatchObject({ tipo: "gravada", resumo: expect.stringContaining("1 de 1 evento.") });
    expect(avisoDaResposta({ ok: true, podem: 0, total: 3 })).toMatchObject({
      tipo: "gravada",
      resumo: expect.stringContaining("você não pode em nenhum destes eventos"),
    });
  });

  it("quando não gravou (enquete encerrada, sessão, leitura), mostra a mensagem e não abre o pop-up", () => {
    expect(avisoDaResposta({ ok: false, mensagem: "Esta enquete já encerrou." })).toEqual({ tipo: "erro", mensagem: "Esta enquete já encerrou." });
  });

  it("o resumo que fica na tela não repete a frase do pop-up", () => {
    expect(RESPOSTA_GRAVADA).toBe("Tudo certo, sua resposta foi gravada!");
    const aviso = avisoDaResposta({ ok: true, podem: 3, total: 4 });
    expect(aviso.tipo === "gravada" && aviso.resumo.includes("gravada")).toBe(false);
  });
});
