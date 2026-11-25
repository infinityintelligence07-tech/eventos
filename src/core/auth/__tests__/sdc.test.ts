import { describe, expect, it } from "vitest";

import type { ResolucaoDoAtor } from "../ator";
import { type AtorSdc, decidirAcessoDaSdc, decidirQuemEntrou, normalizarEmail } from "../sdc";

const LINHA = { id: "5dc00000-0000-7000-8000-000000000001", email: "atendimento.sdc@exemplo.test", nome: "SDC (teste)", ativo: true };
const SDC: AtorSdc = { acessoSdcId: LINHA.id, nome: "SDC (teste)", email: LINHA.email, origem: "SESSAO" };

describe("decidirAcessoDaSdc: quem é a SDC (fail-closed)", () => {
  it("linha ativa da lista vira ator SDC, com a origem do login", () => {
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "atendimento.sdc@exemplo.test")).toEqual(SDC);
    expect(decidirAcessoDaSdc(LINHA, "LOCAL")).toEqual({ ...SDC, origem: "LOCAL" });
  });

  it("e-mail da sessão em maiúsculas ou com espaços é o mesmo e-mail", () => {
    expect(normalizarEmail("  Atendimento.SDC@Exemplo.TEST ")).toBe("atendimento.sdc@exemplo.test");
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "  Atendimento.SDC@Exemplo.TEST ")).toEqual(SDC);
  });

  it("sem linha, desativada ou com e-mail que não bate: não é SDC", () => {
    expect(decidirAcessoDaSdc(null, "SESSAO", LINHA.email)).toBeNull();
    expect(decidirAcessoDaSdc(undefined, "SESSAO", LINHA.email)).toBeNull();
    expect(decidirAcessoDaSdc({ ...LINHA, ativo: false }, "SESSAO", LINHA.email)).toBeNull();
    expect(decidirAcessoDaSdc({ ...LINHA, ativo: false }, "LOCAL")).toBeNull();
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "outra.pessoa@exemplo.test")).toBeNull();
    expect(decidirAcessoDaSdc(LINHA, "SESSAO", "atendimento.sdc@exemplo.test.br")).toBeNull();
    // ativo precisa ser exatamente true (valor estranho vindo do banco não abre a porta).
    expect(decidirAcessoDaSdc({ ...LINHA, ativo: "t" as unknown as boolean }, "SESSAO", LINHA.email)).toBeNull();
  });
});

describe("decidirQuemEntrou: o time vem primeiro", () => {
  const doTime: ResolucaoDoAtor = {
    situacao: "OK",
    ator: { usuarioId: "u", pessoaId: null, nome: "Time A", email: "time.a@exemplo.test", perfis: ["EVENTOS_TIME"], origem: "SESSAO" },
  };

  it("quem é do time continua sendo do time mesmo com o e-mail na lista da SDC", () => {
    expect(decidirQuemEntrou(doTime, SDC)).toBe(doTime);
    expect(decidirQuemEntrou(doTime, null)).toBe(doTime);
  });

  it("quem não é do time e está ativo na lista é SDC; fora da lista, nada muda", () => {
    expect(decidirQuemEntrou({ situacao: "SEM_CADASTRO" }, SDC)).toEqual({ situacao: "SDC", sdc: SDC });
    expect(decidirQuemEntrou({ situacao: "SEM_PERFIL", email: "x@exemplo.test" }, SDC)).toEqual({ situacao: "SDC", sdc: SDC });
    expect(decidirQuemEntrou({ situacao: "SEM_CADASTRO" }, null)).toEqual({ situacao: "SEM_CADASTRO" });
    expect(decidirQuemEntrou({ situacao: "SEM_PERFIL", email: "x@exemplo.test" }, null)).toEqual({ situacao: "SEM_PERFIL", email: "x@exemplo.test" });
  });
});
