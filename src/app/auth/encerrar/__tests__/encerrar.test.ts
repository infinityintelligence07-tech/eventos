import { describe, expect, it } from "vitest";

import type { SituacaoDoAtor } from "@/app/(time)/_servidor/usuario-atual";

import { decisaoDaSaida } from "../decisao";

const ATOR = { usuarioId: "u", pessoaId: null, nome: "Time A", email: "time-a@exemplo.test", perfis: ["EVENTOS_TIME"], origem: "SESSAO" } as const;

describe("/auth/encerrar só encerra quem não tem cadastro ativo", () => {
  it.each<[string, SituacaoDoAtor, string]>([
    ["ator com acesso (link de outro site)", { situacao: "OK", ator: ATOR }, "/inicio"],
    ["sem sessão, fora do modo local", { situacao: "SEM_SESSAO", destino: "/login" }, "/login"],
    ["sem sessão, modo local", { situacao: "SEM_SESSAO", destino: "/entrar-local" }, "/entrar-local"],
    ["sem perfil do Eventos", { situacao: "SEM_PERFIL", email: "x@exemplo.test" }, "/sem-acesso"],
  ])("%s: vai embora sem o formulário", (_caso, situacao, destino) => {
    expect(decisaoDaSaida(situacao)).toEqual({ tipo: "IR", destino });
  });

  it("sem cadastro ativo: mostra o formulário que envia o POST de saída", () => {
    expect(decisaoDaSaida({ situacao: "SEM_CADASTRO" })).toEqual({ tipo: "ENCERRAR" });
  });
});
