import { describe, expect, it } from "vitest";

import { type AcaoSegregada, type AutoriaDaSolicitacao, type Auditor, violacaoDeSegregacao } from "../segregacao";

const TIME_A: Auditor = { usuarioId: "u-a", pessoaId: "p-a", email: "a@exemplo.test" };
const TIME_B: Auditor = { usuarioId: "u-b", pessoaId: "p-b", email: "b@exemplo.test" };
const LIDER: Auditor = { usuarioId: "u-l", pessoaId: "p-l", email: "lider@exemplo.test" };
const SEM_PESSOA: Auditor = { usuarioId: "u-x", pessoaId: null, email: "x@exemplo.test" };

// Solicitação da pessoa B (sem usuário ligado), registrada pela A.
const DA_B_REGISTRADA_PELA_A: AutoriaDaSolicitacao = {
  pessoaId: "p-b",
  usuarioDaPessoa: null,
  emailDaPessoa: "b@exemplo.test",
  registradoPor: "u-a",
  autoresDoRegistro: ["u-a"],
};
// Corrigida depois pela líder.
const CORRIGIDA_PELA_LIDER: AutoriaDaSolicitacao = { ...DA_B_REGISTRADA_PELA_A, registradoPor: "u-l", autoresDoRegistro: ["u-a", "u-l"] };
const SEM_EMAIL: AutoriaDaSolicitacao = { ...DA_B_REGISTRADA_PELA_A, emailDaPessoa: null };

describe("segregação na auditoria de custos (SoD-2 e SoD-3)", () => {
  it.each<[string, AcaoSegregada, Auditor, AutoriaDaSolicitacao, ReturnType<typeof violacaoDeSegregacao>]>([
    ["líder aprova a de outra pessoa que ela não registrou", "APROVAR", LIDER, DA_B_REGISTRADA_PELA_A, null],
    ["SoD-3: a própria pessoa aprova", "APROVAR", TIME_B, DA_B_REGISTRADA_PELA_A, "AUDITA_O_PROPRIO_CUSTO"],
    ["SoD-3: a própria pessoa reprova", "REPROVAR", TIME_B, DA_B_REGISTRADA_PELA_A, "AUDITA_O_PROPRIO_CUSTO"],
    ["SoD-3: a própria pessoa reabre", "REABRIR", TIME_B, DA_B_REGISTRADA_PELA_A, "AUDITA_O_PROPRIO_CUSTO"],
    ["SoD-2: quem registrou aprova", "APROVAR", TIME_A, DA_B_REGISTRADA_PELA_A, "AUDITA_O_QUE_REGISTROU"],
    ["SoD-2: quem registrou reprova", "REPROVAR", TIME_A, DA_B_REGISTRADA_PELA_A, "AUDITA_O_QUE_REGISTROU"],
    ["SoD-2 não vale para reabrir (só SoD-3)", "REABRIR", TIME_A, DA_B_REGISTRADA_PELA_A, null],
    ["SoD-2: quem corrigiu aprova", "APROVAR", LIDER, CORRIGIDA_PELA_LIDER, "AUDITA_O_QUE_REGISTROU"],
    ["SoD-2: quem registrou e não é mais o registrado_por ainda conta", "APROVAR", TIME_A, CORRIGIDA_PELA_LIDER, "AUDITA_O_QUE_REGISTROU"],
    ["registrada pela própria pessoa (portal futuro, registrado_por nulo)", "APROVAR", TIME_A, { ...DA_B_REGISTRADA_PELA_A, registradoPor: null, autoresDoRegistro: [] }, null],
    ["SoD-3 vem antes da SoD-2", "APROVAR", TIME_A, { ...DA_B_REGISTRADA_PELA_A, pessoaId: "p-a", emailDaPessoa: null }, "AUDITA_O_PROPRIO_CUSTO"],
    ["SoD-3 pelo usuário ligado à pessoa", "APROVAR", { ...LIDER, pessoaId: null }, { ...DA_B_REGISTRADA_PELA_A, usuarioDaPessoa: "u-l" }, "AUDITA_O_PROPRIO_CUSTO"],
    // Auditor sem pessoa no cadastro: o e-mail decide.
    ["sem pessoa, e-mail diferente: passa", "APROVAR", SEM_PESSOA, DA_B_REGISTRADA_PELA_A, null],
    ["sem pessoa, mesmo e-mail: próprio custo", "APROVAR", { ...SEM_PESSOA, email: "b@exemplo.test" }, DA_B_REGISTRADA_PELA_A, "AUDITA_O_PROPRIO_CUSTO"],
    ["sem pessoa, e-mail em outra caixa e com espaço: próprio custo", "REABRIR", { ...SEM_PESSOA, email: " B@Exemplo.TEST " }, DA_B_REGISTRADA_PELA_A, "AUDITA_O_PROPRIO_CUSTO"],
    ["sem pessoa e pessoa sem e-mail: recusa (fail-closed)", "APROVAR", SEM_PESSOA, SEM_EMAIL, "SEM_COMO_CONFERIR_A_PESSOA"],
    ["sem pessoa e pessoa com e-mail vazio: recusa", "REABRIR", SEM_PESSOA, { ...SEM_EMAIL, emailDaPessoa: "  " }, "SEM_COMO_CONFERIR_A_PESSOA"],
    ["sem pessoa e auditor sem e-mail: recusa", "REPROVAR", { ...SEM_PESSOA, email: null }, DA_B_REGISTRADA_PELA_A, "SEM_COMO_CONFERIR_A_PESSOA"],
    ["com pessoa, pessoa da solicitação sem e-mail: a pessoa basta", "APROVAR", LIDER, SEM_EMAIL, null],
    ["com pessoa, mas mesmo e-mail da solicitação: próprio custo", "APROVAR", { ...LIDER, email: "b@exemplo.test" }, DA_B_REGISTRADA_PELA_A, "AUDITA_O_PROPRIO_CUSTO"],
  ])("%s", (_caso, acao, auditor, autoria, esperado) => {
    expect(violacaoDeSegregacao(acao, auditor, autoria)).toBe(esperado);
  });
});
