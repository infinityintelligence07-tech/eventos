import { describe, expect, it } from "vitest";

import { turmaDeExemplo } from "@/test/turmas";

import { eventoDaTurma, siglaDaUf, statusDoEvento, tipoDoTreinamento } from "../turma";

const treinamento = (nome: string | null, sigla: string | null = null, tipo_palestra = false) => ({
  nome,
  sigla,
  tipo_palestra,
});

describe("tipo do evento pelo treinamento do IAM Control", () => {
  it("IPR vira ASM a partir da edição 230", () => {
    expect(tipoDoTreinamento(treinamento("Imersão Prosperar", "IPR"), "229")).toBe("IPR");
    expect(tipoDoTreinamento(treinamento("Imersão Prosperar", "IPR"), "230")).toBe("ASM");
    expect(tipoDoTreinamento(treinamento("Imersão Prosperar", "IPR"), "243")).toBe("ASM");
    expect(tipoDoTreinamento(treinamento("Acorde Sua Mente"), null)).toBe("ASM");
    expect(tipoDoTreinamento(treinamento("IMERSAO PROSPERAR"), "sem número")).toBe("IPR");
  });

  it("reconhece os demais pelo nome ou pela sigla", () => {
    expect(tipoDoTreinamento(treinamento("Confronto"), "60")).toBe("CONF");
    expect(tipoDoTreinamento(treinamento("Missão Governar"), "12")).toBe("MG");
    expect(tipoDoTreinamento(treinamento("Imersão de Negócios (taxa de inscrição)"), "3")).toBe("IMERSAO_NEGOCIOS");
    expect(tipoDoTreinamento(treinamento("Liberty IDN", "IDN"), "3")).toBe("IMERSAO_NEGOCIOS");
    expect(tipoDoTreinamento(treinamento("Liberty", "LIB"), "8")).toBe("LIB");
    expect(tipoDoTreinamento(treinamento("Legacy XP"), "2")).toBe("LEGACY");
    expect(tipoDoTreinamento(treinamento("Masterclass Prosperidade", null, true), null)).toBe("MC");
    expect(tipoDoTreinamento(treinamento("PNL | PMR"), "1")).toBe("PNL_PMR");
    expect(tipoDoTreinamento(treinamento("Mesa de Destino"), "1")).toBe("MESA_DESTINO");
  });

  it("não inventa tipo para o que o time não escala", () => {
    expect(tipoDoTreinamento(treinamento("Legacy Coffee"), null)).toBeNull();
    expect(tipoDoTreinamento(treinamento("Mentoria Individual"), null)).toBeNull();
    expect(tipoDoTreinamento(treinamento(null), null)).toBeNull();
  });
});

describe("UF", () => {
  it("aceita sigla ou nome do estado", () => {
    expect(siglaDaUf("am")).toBe("AM");
    expect(siglaDaUf("São Paulo")).toBe("SP");
    expect(siglaDaUf("Mato Grosso do Sul")).toBe("MS");
    expect(siglaDaUf("Lisboa")).toBeNull();
    expect(siglaDaUf(null)).toBeNull();
  });
});

describe("status do evento", () => {
  const ativa = { excluida_em: null, status_evento: "OK" };
  it("pela data de hoje e pelo cancelamento no IAM Control", () => {
    expect(statusDoEvento(ativa, "2026-12-12", "2026-12-15", "2026-10-26")).toBe("PLANEJADO");
    expect(statusDoEvento(ativa, "2026-12-12", "2026-12-15", "2026-12-12")).toBe("EM_ANDAMENTO");
    expect(statusDoEvento(ativa, "2026-12-12", "2026-12-15", "2026-12-15")).toBe("EM_ANDAMENTO");
    expect(statusDoEvento(ativa, "2026-12-12", "2026-12-15", "2026-12-16")).toBe("CONCLUIDO");
    expect(statusDoEvento({ ...ativa, status_evento: "CANCELADA" }, "2026-12-12", "2026-12-15", "2026-10-26")).toBe(
      "CANCELADO",
    );
    expect(statusDoEvento({ ...ativa, excluida_em: "2026-10-01" }, "2026-12-12", "2026-12-15", "2026-10-26")).toBe(
      "CANCELADO",
    );
  });
});

describe("evento a partir da turma", () => {
  it("monta código, nome, datas em Brasília, público e local", () => {
    const resultado = eventoDaTurma(turmaDeExemplo(), "2026-10-26", { CONF: "Confronto" });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.evento).toMatchObject({
      iamControlTurmaId: 501,
      tipoSigla: "CONF",
      codigo: "CONF_AM_60",
      edicao: "60",
      nome: "Confronto · ed. 60 · Manaus",
      dataInicio: "2026-12-12",
      dataFim: "2026-12-15",
      status: "PLANEJADO",
      expectativaPublico: 300,
      poloSigla: "AM",
      local: { nome: "Centro de Convenções Vasco Vasques", cidade: "Manaus", uf: "AM", cep: "69058795" },
    });
    expect(resultado.evento.inicio.toISOString()).toBe("2026-12-12T03:00:00.000Z");
    expect(resultado.evento.fim.toISOString()).toBe("2026-12-16T02:59:59.000Z");
  });

  it("público usa os inscritos quando passam da meta", () => {
    const resultado = eventoDaTurma(turmaDeExemplo({ meta: 300, inscritos_ativos: 340 }), "2026-10-26");
    expect(resultado.ok && resultado.evento.expectativaPublico).toBe(340);
    const vazio = eventoDaTurma(turmaDeExemplo({ meta: null, inscritos_ativos: 0 }), "2026-10-26");
    expect(vazio.ok && vazio.evento.expectativaPublico).toBeNull();
  });

  it("sem edição numérica ou polo fica sem código, mas o evento é criado", () => {
    const semEdicao = eventoDaTurma(turmaDeExemplo({ edicao: null }), "2026-10-26");
    expect(semEdicao.ok && semEdicao.evento.codigo).toBeNull();
    const semPolo = eventoDaTurma(turmaDeExemplo({ polo: null }), "2026-10-26");
    expect(semPolo.ok && semPolo.evento.codigo).toBeNull();
  });

  it("local cai para o endereço do polo e some sem cidade/UF", () => {
    const vazio = { nome: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, cep: null };
    const doPolo = eventoDaTurma(turmaDeExemplo({ local: vazio }), "2026-10-26");
    expect(doPolo.ok && doPolo.evento.local).toMatchObject({ nome: "Local a definir — Manaus", cidade: "Manaus", uf: "AM" });
    const semNada = eventoDaTurma(turmaDeExemplo({ local: vazio, polo: null }), "2026-10-26");
    expect(semNada.ok && semNada.evento.local).toBeNull();
  });

  it("data final antes da inicial vira evento de um dia; sem data é ignorada", () => {
    const invertida = eventoDaTurma(turmaDeExemplo({ data_final: "2026-12-01" }), "2026-10-26");
    expect(invertida.ok && invertida.evento.dataFim).toBe("2026-12-12");
    expect(eventoDaTurma(turmaDeExemplo({ data_inicio: null }), "2026-10-26")).toEqual({
      ok: false,
      iamControlTurmaId: 501,
      motivo: "SEM_DATA",
      treinamento: "Confronto",
    });
  });

  it("treinamento que não é evento é ignorado com o motivo", () => {
    const resultado = eventoDaTurma(
      turmaDeExemplo({ treinamento: { id: 1, nome: "Mentoria", sigla: null, tipo_evento: false, tipo_palestra: false } }),
      "2026-10-26",
    );
    expect(resultado).toMatchObject({ ok: false, motivo: "TIPO_NAO_RECONHECIDO", treinamento: "Mentoria" });
  });
});
