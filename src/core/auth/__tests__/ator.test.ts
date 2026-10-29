import { describe, expect, it } from "vitest";

import { type CadastroDoUsuario, decidirAcesso, type PerfilDoEventos, rotuloDoPerfil } from "../ator";

const USUARIO = "7e570000-0000-7000-8000-000000000001";
const PESSOA = "7e570000-0000-7000-8000-0000000000a1";

function cadastro(mudancas: Partial<CadastroDoUsuario["usuario"]> = {}, atribuicoes: CadastroDoUsuario["atribuicoes"] = []): CadastroDoUsuario {
  return {
    usuario: { id: USUARIO, email: "time.a@exemplo.test", nomeUsuario: "time.a", ativo: true, apagado: false, ...mudancas },
    pessoa: { id: PESSOA, nome: "Time A (teste)" },
    atribuicoes,
  };
}

describe("decidirAcesso: quem entra no Eventos", () => {
  it("usuário ativo com perfil GLOBAL do Eventos entra", () => {
    expect(decidirAcesso(cadastro({}, [{ codigo: "EVENTOS_TIME", escopo: "GLOBAL" }]), "SESSAO").resolucao).toEqual({
      situacao: "OK",
      ator: {
        usuarioId: USUARIO,
        pessoaId: PESSOA,
        nome: "Time A (teste)",
        email: "time.a@exemplo.test",
        perfis: ["EVENTOS_TIME"],
        origem: "SESSAO",
      },
    });
  });

  it("sem perfil do Eventos → sem acesso (perfis do GH não contam)", () => {
    const { resolucao } = decidirAcesso(cadastro({}, [{ codigo: "CEO", escopo: "GLOBAL" }, { codigo: "COORD_EVENTOS", escopo: "GLOBAL" }]), "SESSAO");
    expect(resolucao).toEqual({ situacao: "SEM_PERFIL", email: "time.a@exemplo.test" });
    expect(decidirAcesso(cadastro(), "LOCAL").resolucao).toEqual({ situacao: "SEM_PERFIL", email: "time.a@exemplo.test" });
  });

  it.each<[string, Partial<CadastroDoUsuario["usuario"]>]>([
    ["inativo", { ativo: false }],
    ["apagado", { apagado: true }],
    ["sem e-mail", { email: null }],
  ])("usuário %s → sem cadastro (sai da sessão), mesmo com perfil", (_caso, mudanca) => {
    expect(decidirAcesso(cadastro(mudanca, [{ codigo: "EVENTOS_LIDER", escopo: "GLOBAL" }]), "SESSAO").resolucao).toEqual({ situacao: "SEM_CADASTRO" });
  });

  it("sem core.usuario → sem cadastro", () => {
    expect(decidirAcesso(null, "SESSAO").resolucao).toEqual({ situacao: "SEM_CADASTRO" });
  });

  it("perfil do Eventos com escopo de polo não dá acesso e é devolvido para o log (fail-closed)", () => {
    const { resolucao, ignorados } = decidirAcesso(cadastro({}, [{ codigo: "EVENTOS_LIDER", escopo: "POLO" }]), "SESSAO");
    expect(resolucao).toEqual({ situacao: "SEM_PERFIL", email: "time.a@exemplo.test" });
    expect(ignorados).toEqual([{ codigo: "EVENTOS_LIDER", escopo: "POLO" }]);
  });

  it("os dois perfis, em ordem fixa e sem repetição; nome cai para o nome de usuário e depois o e-mail", () => {
    const atribuicoes = [
      { codigo: "EVENTOS_LIDER", escopo: "GLOBAL" },
      { codigo: "EVENTOS_TIME", escopo: "GLOBAL" },
      { codigo: "EVENTOS_TIME", escopo: "POLO" },
    ];
    const semPessoa = { ...cadastro({}, atribuicoes), pessoa: null };
    const { resolucao } = decidirAcesso(semPessoa, "LOCAL");
    expect(resolucao).toMatchObject({ situacao: "OK", ator: { perfis: ["EVENTOS_TIME", "EVENTOS_LIDER"], nome: "time.a", pessoaId: null, origem: "LOCAL" } });
    const semNome = { ...cadastro({ nomeUsuario: null }, atribuicoes), pessoa: null };
    expect(decidirAcesso(semNome, "LOCAL").resolucao).toMatchObject({ ator: { nome: "time.a@exemplo.test" } });
  });

  it("rótulos dos perfis", () => {
    expect(rotuloDoPerfil("EVENTOS_TIME")).toBe("Time de eventos");
    expect(rotuloDoPerfil("EVENTOS_LIDER")).toBe("Líder do time");
    expect(() => rotuloDoPerfil("CEO" as PerfilDoEventos)).toThrow(/desconhecido/);
  });
});
