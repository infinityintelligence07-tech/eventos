import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  dadosDoFormulario,
  FormularioGrandeDemaisError,
  LIMITES_DO_FORMULARIO,
  lerFormulario,
  MENSAGEM_FORMULARIO_GRANDE,
  MENSAGEM_FORMULARIO_INVALIDO,
} from "../formulario";

function formulario(campos: [string, string][]): FormData {
  const form = new FormData();
  for (const [chave, valor] of campos) form.append(chave, valor);
  return form;
}

describe("dadosDoFormulario", () => {
  it("lê campos simples, listas e linhas indexadas", () => {
    const form = formulario([
      ["eventoId", "7e570000-0000-7000-8000-000000000001"],
      ["eventoIds[]", "a"],
      ["eventoIds[]", "b"],
      ["linhas[0].escalaId", "x"],
      ["linhas[0].quantidade", "8"],
      ["linhas.1.escalaId", "y"],
      ["tags", "1"],
      ["tags", "2"],
      ["vazio", ""],
      ["$ACTION_ID_abc", ""],
      ["$ACTION_REF_1", "x"],
    ]);
    expect(dadosDoFormulario(form)).toEqual({
      eventoId: "7e570000-0000-7000-8000-000000000001",
      eventoIds: ["a", "b"],
      linhas: [{ escalaId: "x", quantidade: "8" }, { escalaId: "y" }],
      tags: ["1", "2"],
    });
  });

  it("ignora chaves que mexeriam no protótipo", () => {
    const dados = dadosDoFormulario(formulario([["__proto__.admin", "1"], ["a.constructor.prototype.x", "1"], ["ok", "1"]]));
    expect(dados).toEqual({ ok: "1" });
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe("lerFormulario", () => {
  const schema = z.object({
    eventoId: z.uuid(),
    comentario: z.string().max(10).optional(),
    linhas: z.array(z.object({ quantidade: z.coerce.number().int().min(1).max(500) })).min(1),
  });

  it("devolve os dados tipados quando o formulário é válido", () => {
    const lido = lerFormulario(
      formulario([
        ["eventoId", "7e570000-0000-7000-8000-000000000001"],
        ["linhas[0].quantidade", "8"],
      ]),
      schema,
    );
    expect(lido).toEqual({ ok: true, dados: { eventoId: "7e570000-0000-7000-8000-000000000001", linhas: [{ quantidade: 8 }] } });
  });

  it("devolve os erros por campo, em português", () => {
    const lido = lerFormulario(
      formulario([
        ["comentario", "texto longo demais"],
        ["linhas[0].quantidade", "0"],
      ]),
      schema,
    );
    expect(lido.ok).toBe(false);
    if (lido.ok) return;
    expect(lido.erro).toBe(MENSAGEM_FORMULARIO_INVALIDO);
    expect(lido.campos?.eventoId).toEqual(["Preencha este campo."]);
    expect(Object.keys(lido.campos ?? {}).sort()).toEqual(["comentario", "eventoId", "linhas.0.quantidade"]);
    expect(lido.campos?.["linhas.0.quantidade"]?.[0]).toMatch(/esperava/);
  });

  it("mensagem do schema tem prioridade e erro sem campo vai para `erro`", () => {
    const comRegra = z
      .object({ de: z.string(), ate: z.string({ error: "Informe a data final." }) })
      .refine((valor) => valor.de <= valor.ate, { message: "A data final vem depois da inicial." });
    const semAte = lerFormulario(formulario([["de", "2026-11-02"]]), comRegra);
    expect(!semAte.ok && semAte.campos?.ate).toEqual(["Informe a data final."]);
    const invertido = lerFormulario(formulario([["de", "2026-11-02"], ["ate", "2026-11-01"]]), comRegra);
    expect(!invertido.ok && invertido.erro).toBe("A data final vem depois da inicial.");
  });
});

describe("limites contra formulário forjado", () => {
  const schema = z.object({ linhas: z.array(z.object({ quantidade: z.string() })).max(100) });

  it("índice enorme é recusado na hora, sem alocar a lista", () => {
    const inicio = performance.now();
    const lido = lerFormulario(formulario([["linhas[1000000].quantidade", "1"]]), schema);
    expect(performance.now() - inicio).toBeLessThan(10);
    expect(lido).toEqual({ ok: false, erro: MENSAGEM_FORMULARIO_GRANDE });
    expect(() => dadosDoFormulario(formulario([["linhas.201.quantidade", "1"]]))).toThrow(FormularioGrandeDemaisError);
    // "1e6" não é índice: vira chave de objeto (sem alocar lista) e o Zod recusa.
    expect(dadosDoFormulario(formulario([["linhas[1e6].quantidade", "1"]]))).toEqual({ linhas: { "1e6": { quantidade: "1" } } });
    expect(lerFormulario(formulario([["linhas[1e6].quantidade", "1"]]), schema).ok).toBe(false);
  });

  it("até o limite passa; campos, profundidade e chave longa demais são recusados", () => {
    expect((dadosDoFormulario(formulario([["linhas[200].quantidade", "1"]])).linhas as unknown[]).length).toBe(201);
    const muitos = Array.from({ length: LIMITES_DO_FORMULARIO.campos + 1 }, (_, i) => [`c${i}`, "1"] as [string, string]);
    expect(() => dadosDoFormulario(formulario(muitos))).toThrow(FormularioGrandeDemaisError);
    const listaLonga = Array.from({ length: LIMITES_DO_FORMULARIO.indice + 2 }, () => ["ids[]", "x"] as [string, string]);
    expect(() => dadosDoFormulario(formulario(listaLonga))).toThrow(FormularioGrandeDemaisError);
    expect(() => dadosDoFormulario(formulario([["a.b.c.d.e.f.g", "1"]]))).toThrow(FormularioGrandeDemaisError);
    expect(() => dadosDoFormulario(formulario([["x".repeat(201), "1"]]))).toThrow(FormularioGrandeDemaisError);
  });
});
