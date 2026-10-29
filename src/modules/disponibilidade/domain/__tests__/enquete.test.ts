import { describe, expect, it } from "vitest";

import {
  descricaoDoFechamento,
  fechaEmBreve,
  fechaEmNoCampo,
  fechaEmPadrao,
  periodoPadrao,
  rotuloDaSituacaoDaEnquete,
  type SituacaoDaEnquete,
  situacaoDaEnquete,
  textoDoConvite,
  tituloSugerido,
} from "../enquete";
import { abrirEnqueteSchema, alterarEnqueteSchema, registrarDisponibilidadeSchema } from "../schemas";
import { instanteDeSaoPaulo } from "../tempo";

const agora = new Date("2026-10-28T15:00:00Z"); // 12:00 em São Paulo
const ID = "7e570000-0000-7000-8000-000000000001";
const OUTRO_ID = "7e570000-0000-7000-8000-000000000002";

describe("situação da enquete", () => {
  it.each<[string, SituacaoDaEnquete]>([
    ["2026-10-28T15:00:01Z", "ABERTA"],
    ["2026-10-28T15:00:00Z", "ENCERRADA"],
    ["2026-10-01T00:00:00Z", "ENCERRADA"],
  ])("fecha_em %s → %s", (fechaEm, esperada) => {
    expect(situacaoDaEnquete(new Date(fechaEm), agora)).toBe(esperada);
  });

  it("rótulos da doc 08 §13", () => {
    expect(rotuloDaSituacaoDaEnquete("ABERTA")).toBe("Aberta");
    expect(rotuloDaSituacaoDaEnquete("ENCERRADA")).toBe("Encerrada");
    expect(() => rotuloDaSituacaoDaEnquete("RASCUNHO" as SituacaoDaEnquete)).toThrow(/desconhecida/);
  });

  it.each<[string, boolean]>([
    ["2026-10-29T15:00:00Z", true],
    ["2026-10-31T15:00:00Z", true],
    ["2026-10-31T15:00:01Z", false],
    ["2026-10-28T14:00:00Z", false],
  ])("fecha em breve (até 3 dias, só aberta): %s → %s", (fechaEm, esperado) => {
    expect(fechaEmBreve(new Date(fechaEm), agora)).toBe(esperado);
  });

  it("descreve o fechamento conforme a situação", () => {
    expect(descricaoDoFechamento(new Date("2026-11-04T02:59:00Z"), agora)).toBe("Fecha em 03/11 às 23:59");
    expect(descricaoDoFechamento(new Date("2026-10-20T12:00:00Z"), agora)).toBe("Encerrada em 20/10 às 09:00");
  });
});

describe("datas em São Paulo", () => {
  it("lê o campo datetime-local como horário de São Paulo", () => {
    expect(instanteDeSaoPaulo("2026-11-15T23:59")?.toISOString()).toBe("2026-11-16T02:59:00.000Z");
    // Horário de verão de 2018 (UTC-2).
    expect(instanteDeSaoPaulo("2018-12-01T12:00")?.toISOString()).toBe("2018-12-01T14:00:00.000Z");
  });

  it.each(["", "2026-02-30T10:00", "2026-11-15", "2026-11-15T25:00", "amanhã"])("texto inválido %j → nulo", (texto) => {
    expect(instanteDeSaoPaulo(texto)).toBeNull();
  });

  it("padrões da Nova enquete: fecha em 7 dias às 23:59 e período de 60 dias", () => {
    expect(fechaEmPadrao(agora)).toBe("2026-11-04T23:59");
    expect(fechaEmPadrao(new Date("2026-10-29T02:30:00Z"))).toBe("2026-11-04T23:59");
    expect(periodoPadrao(agora)).toEqual({ de: "2026-10-28", ate: "2026-12-27" });
    expect(fechaEmNoCampo(new Date("2026-11-16T02:59:00Z"))).toBe("2026-11-15T23:59");
  });

  it("título sugerido a partir do período", () => {
    expect(tituloSugerido("2026-12-01", "2026-12-31")).toBe("Eventos de 01/12 a 31/12");
    expect(tituloSugerido("2026-12-01", "2026-12-01")).toBe("Eventos de 01/12");
  });
});

describe("convite para o WhatsApp", () => {
  it("lista os eventos e o prazo", () => {
    const texto = textoDoConvite({
      titulo: "Eventos de novembro",
      fechaEm: new Date("2026-11-16T02:59:00Z"),
      eventos: [
        { codigo: "CONF_AM_60", nome: "Confronto ed. 60", dataInicio: "2026-11-12", dataFim: "2026-11-14" },
        { codigo: null, nome: "Masterclass", dataInicio: "2026-11-20", dataFim: "2026-11-20" },
      ],
    });
    expect(texto).toBe(
      [
        "*Eventos de novembro*",
        "Em quais destes eventos você pode trabalhar?",
        "",
        "• CONF_AM_60 · Confronto ed. 60 · 12/11 a 14/11",
        "• Masterclass · 20/11",
        "",
        "Responda com os eventos em que você pode até 15/11 às 23:59.",
      ].join("\n"),
    );
  });
});

describe("schemas das ações", () => {
  const abrir = abrirEnqueteSchema(agora);

  it("abrir: aceita um evento só (sem lista) e remove repetidos", () => {
    expect(abrir.parse({ titulo: "  Eventos de novembro ", fechaEm: "2026-11-04T23:59", eventoIds: ID })).toEqual({
      titulo: "Eventos de novembro",
      fechaEm: new Date("2026-11-05T02:59:00Z"),
      eventoIds: [ID],
    });
    expect(abrir.parse({ titulo: "Eventos", fechaEm: "2026-11-04T23:59", eventoIds: [ID, OUTRO_ID, ID] }).eventoIds).toEqual([ID, OUTRO_ID]);
  });

  it("abrir: sem evento, data no passado e título curto", () => {
    const resultado = abrir.safeParse({ titulo: "Ev", fechaEm: "2026-10-28T11:59" });
    expect(resultado.success).toBe(false);
    const mensagens = Object.fromEntries(resultado.error!.issues.map((issue) => [issue.path.join("."), issue.message]));
    expect(mensagens).toEqual({
      titulo: "Use pelo menos 3 caracteres.",
      fechaEm: "Escolha uma data a partir de hoje.",
      eventoIds: "Escolha pelo menos um evento.",
    });
  });

  it("alterar: precisa de algo para mudar; reabrir exige data futura", () => {
    expect(alterarEnqueteSchema(agora).safeParse({ enqueteId: ID }).success).toBe(false);
    expect(alterarEnqueteSchema(agora).safeParse({ enqueteId: ID, fechaEm: "2026-10-01T10:00" }).success).toBe(false);
    expect(alterarEnqueteSchema(agora).parse({ enqueteId: ID, fechaEm: "2026-11-01T10:00" }).fechaEm).toEqual(new Date("2026-11-01T13:00:00Z"));
  });

  it("registrar: respostas válidas, sem evento repetido", () => {
    const base = { enqueteId: ID, pessoaId: OUTRO_ID };
    expect(registrarDisponibilidadeSchema.safeParse({ ...base, respostas: [{ eventoId: ID, resposta: "PODE" }] }).success).toBe(true);
    expect(registrarDisponibilidadeSchema.safeParse({ ...base, respostas: [] }).success).toBe(false);
    expect(registrarDisponibilidadeSchema.safeParse({ ...base, respostas: [{ eventoId: ID, resposta: "TALVEZ" }] }).success).toBe(false);
    expect(
      registrarDisponibilidadeSchema.safeParse({
        ...base,
        respostas: [
          { eventoId: ID, resposta: "PODE" },
          { eventoId: ID, resposta: "NAO_PODE" },
        ],
      }).success,
    ).toBe(false);
  });
});
