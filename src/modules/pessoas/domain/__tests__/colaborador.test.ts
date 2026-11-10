import { describe, expect, it } from "vitest";

import { type ColaboradorDoIamControl, planoDoColaborador } from "../colaborador";

const base: ColaboradorDoIamControl = {
  id: 7,
  nome: "  Ana   Souza ",
  email: " Ana@Exemplo.com ",
  telefone: " 11 99999-0000 ",
  setores: ["EVENTOS"],
  funcoes: ["STAFF", "DJ"],
  ativo: true,
};

const plano = (mudanca: Partial<ColaboradorDoIamControl> = {}) => {
  const resultado = planoDoColaborador({ ...base, ...mudanca });
  if (!resultado.ok) throw new Error(`ignorado: ${resultado.motivo}`);
  return resultado.plano;
};

describe("colaborador do IAM Control no Eventos", () => {
  it("normaliza e-mail, nome e telefone", () => {
    expect(plano()).toMatchObject({ iamControlUserId: 7, email: "ana@exemplo.com", nome: "Ana Souza", telefone: "11 99999-0000", ativo: true });
    expect(plano({ telefone: "  " }).telefone).toBeNull();
  });

  it("nunca dá acesso de time: nem pelo setor EVENTOS, nem por função de líder", () => {
    for (const mudanca of [{}, { funcoes: ["LIDER_DE_EVENTOS"] }, { setores: ["EVENTOS", "ADMINISTRADOR"] }]) {
      const resultado = plano(mudanca);
      expect(resultado).not.toHaveProperty("timeDeEventos");
      expect(resultado).not.toHaveProperty("lider");
    }
  });

  it("escalável com alguma função de evento e conta ativa", () => {
    expect(plano().escalavel).toBe(true);
    expect(plano({ funcoes: ["PALESTRANTE"] }).escalavel).toBe(true);
    expect(plano({ funcoes: ["LOGISTICA"] }).escalavel).toBe(true);
    expect(plano({ funcoes: ["VENDEDOR", "COLABORADOR"] }).escalavel).toBe(false);
    expect(plano({ ativo: false }).escalavel).toBe(false);
  });

  it("converte as funções com correspondente no Eventos, sem repetir", () => {
    expect(plano({ funcoes: ["STAFF", "DJ", "FOTOGRAFO", "SOCIAL_MEDIA"] }).funcoesDoEventos).toEqual(["STAFF", "DJ", "FOTOGRAFO", "SOCIAL_MEDIA"]);
    expect(plano({ funcoes: ["LIDER_DE_CONFRONTO", "LIDER_DE_MASTERCLASS", "LIDER_DE_EVENTOS"] }).funcoesDoEventos).toEqual(["LIDER", "LIDER_EVENTO"]);
    expect(plano({ funcoes: ["LOGISTICA", "VENDEDOR"] }).funcoesDoEventos).toEqual([]);
  });

  it("ignora e-mail inválido ou nome vazio", () => {
    expect(planoDoColaborador({ ...base, email: "sem-arroba" })).toEqual({ ok: false, iamControlUserId: 7, motivo: "EMAIL_INVALIDO" });
    expect(planoDoColaborador({ ...base, nome: "   " })).toEqual({ ok: false, iamControlUserId: 7, motivo: "NOME_VAZIO" });
  });
});
