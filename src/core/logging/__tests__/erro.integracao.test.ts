import { Writable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { evento } from "@/core/db/schema/eventos";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { serializarErro } from "../erro";
import { criarPino, prepararParaLog } from "../logger";

const MARCADOR = "MARCADOR_SIGILOSO_7319";

function capturarLog() {
  const linhas: string[] = [];
  const destino = new Writable({
    write(pedaco, _codificacao, pronto) {
      linhas.push(String(pedaco));
      pronto();
    },
  });
  return { log: criarPino("info", destino), texto: () => linhas.join("") };
}

describe.skipIf(!TEST_DATABASE_URL)("log de erro do banco sem dados pessoais", () => {
  let banco: BancoDeTeste;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("violação de UNIQUE: o valor não aparece no log, a constraint e o código sim", async () => {
    const linha = { nome: `Evento ${MARCADOR}`, codigo: MARCADOR, inicio: new Date(), fim: new Date(), status: "PLANEJADO" };
    await banco.db.insert(evento).values(linha);
    const erro = await banco.db
      .insert(evento)
      .values(linha)
      .then(() => null, (falha: unknown) => falha);
    expect(erro).toBeInstanceOf(Error);
    // O erro cru carrega o marcador (params do Drizzle e detail do pg): é isso que não pode vazar.
    expect(JSON.stringify(erro, Object.getOwnPropertyNames(erro as object)) + String((erro as Error).cause && JSON.stringify((erro as Error).cause, Object.getOwnPropertyNames((erro as Error).cause as object)))).toContain(MARCADOR);

    const { log, texto } = capturarLog();
    log.error(prepararParaLog({ err: erro, origem: "teste" }) as object, "falha");
    const saida = texto();
    expect(saida).not.toContain(MARCADOR);
    expect(saida).toContain("23505");
    expect(saida).toContain("evento_codigo_unique");

    const serializado = serializarErro(erro);
    expect(JSON.stringify(serializado)).not.toContain(MARCADOR);
    const chaves = (objeto: object): string[] => Object.entries(objeto).flatMap(([chave, valor]) => [chave, ...(valor && typeof valor === "object" ? chaves(valor) : [])]);
    expect(chaves(serializado).filter((chave) => ["params", "detail", "where", "query", "parameters"].includes(chave))).toEqual([]);
  });
});
