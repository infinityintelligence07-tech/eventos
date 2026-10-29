import { describe, expect, it } from "vitest";

import { serializarErro } from "../erro";
import { redactSensitive } from "../redact";

function erroDoPg(campos: Record<string, unknown>, mensagem: string): Error {
  return Object.assign(new Error(mensagem), campos);
}

describe("serializarErro", () => {
  it("guarda só a lista fixa de campos e tira os valores da mensagem", () => {
    const causa = erroDoPg(
      { code: "22P02", detail: "Key (cpf)=(123.456.789-00)", where: "x", routine: "string_to_uuid" },
      'invalid input syntax for type uuid: "joana@exemplo.test"',
    );
    const drizzle = Object.assign(new Error('Failed query: select * from "core"."pessoa" where "id" = $1\nparams: joana@exemplo.test'), {
      query: 'select * from "core"."pessoa" where "id" = $1',
      params: ["joana@exemplo.test"],
      cause: causa,
    });
    const serializado = serializarErro(drizzle);
    expect(JSON.stringify(serializado)).not.toMatch(/joana|123\.456/);
    expect(serializado.message).toBe('Failed query: select * from "core"."pessoa" where "id" = $1');
    expect(serializado.cause).toMatchObject({ code: "22P02", routine: "string_to_uuid", message: 'invalid input syntax for type uuid: "…"' });
    expect(serializado.stack?.split("\n").every((linha) => linha.trimStart().startsWith("at "))).toBe(true);
  });

  it("mantém o nome da constraint na mensagem", () => {
    const erro = erroDoPg({ code: "23505", constraint: "evento_codigo_unique", table: "evento" }, 'duplicate key value violates unique constraint "evento_codigo_unique"');
    expect(serializarErro(erro).message).toBe('duplicate key value violates unique constraint "evento_codigo_unique"');
  });

  it("redactSensitive serializa Error em qualquer nível e aceita valor que não é Error", () => {
    const resultado = redactSensitive({ err: Object.assign(new Error("x\nparams: segredo"), { params: ["segredo"] }), lista: [new Error("y")] });
    expect(JSON.stringify(resultado)).not.toContain("segredo");
    expect(serializarErro("texto")).toEqual({ name: "string", message: "valor lançado não é um Error" });
  });
});
