import { describe, expect, it, vi } from "vitest";

import type { LeituraDoServidor, SituacaoDaEscrita } from "@/core/ambiente";
import type { Db } from "@/core/db/database";

import { criarGuardaDeEscrita } from "../banco";
import { EscritaDesligadaError, mensagemDoErro, MENSAGEM_ESCRITA_DESLIGADA } from "../erros";

const BANCO = { nome: "banco falso" } as unknown as Db;
const ABERTO: SituacaoDaEscrita = { liberada: true };
const SERVIDOR_LOCAL: LeituraDoServidor = { marcador: "local", endereco: "127.0.0.1", porta: 55432 };

function guarda({ ambiente = ABERTO, servidor = SERVIDOR_LOCAL as LeituraDoServidor | Error, portaEsperada = 55432 as number | null } = {}) {
  const banco = vi.fn(async () => BANCO);
  const lerServidor = vi.fn(async () => {
    if (servidor instanceof Error) throw servidor;
    return servidor;
  });
  return {
    banco,
    lerServidor,
    guarda: criarGuardaDeEscrita({ ambiente: () => ambiente, banco, servidor: lerServidor, portaEsperada: () => portaEsperada }),
  };
}

describe("bancoParaEscrita: as três travas", () => {
  it("libera o banco quando as três passam", async () => {
    const { guarda: g } = guarda();
    await expect(g.bancoParaEscrita()).resolves.toBe(BANCO);
    await expect(g.situacao()).resolves.toEqual({ liberada: true });
  });

  it("trava 1 fechada: recusa sem tocar no banco", async () => {
    const { guarda: g, banco } = guarda({ ambiente: { liberada: false, trava: "MODO_LOCAL", motivo: "EVENTOS_MODO não é local." } });
    await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
    expect(banco).not.toHaveBeenCalled();
  });

  it("trava 2 fechada: recusa sem tocar no banco", async () => {
    const { guarda: g, banco } = guarda({ ambiente: { liberada: false, trava: "HOST_LOCAL", motivo: "fora de localhost" } });
    await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
    expect(banco).not.toHaveBeenCalled();
  });

  it("trava 3: marcador ausente ou diferente recusa", async () => {
    for (const marcador of [null, "producao"]) {
      const { guarda: g } = guarda({ servidor: { ...SERVIDOR_LOCAL, marcador } });
      await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
      await expect(g.situacao()).resolves.toMatchObject({ liberada: false, trava: "MARCADOR_NO_BANCO" });
    }
  });

  it("trava 3: servidor fora do loopback ou em outra porta (túnel) recusa", async () => {
    for (const servidor of [
      { ...SERVIDOR_LOCAL, endereco: "10.0.0.5" },
      { ...SERVIDOR_LOCAL, porta: 5432 },
    ]) {
      const { guarda: g } = guarda({ servidor });
      await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
      await expect(g.situacao()).resolves.toMatchObject({ liberada: false, trava: "SERVIDOR_LOCAL" });
    }
  });

  it("trava 3: socket Unix (sem endereço nem porta) com marcador libera", async () => {
    const { guarda: g } = guarda({ servidor: { marcador: "local", endereco: null, porta: null } });
    await expect(g.bancoParaEscrita()).resolves.toBe(BANCO);
  });

  it("trava 3: erro ao ler o servidor recusa (fail-closed)", async () => {
    const { guarda: g } = guarda({ servidor: new Error("conexão recusada") });
    await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
    await expect(g.situacao()).resolves.toMatchObject({ liberada: false, trava: "MARCADOR_NO_BANCO" });
  });

  it("lê o servidor uma vez quando confere, mas continua checando o ambiente", async () => {
    let ambiente: SituacaoDaEscrita = ABERTO;
    const lerServidor = vi.fn(async () => SERVIDOR_LOCAL);
    const g = criarGuardaDeEscrita({ ambiente: () => ambiente, banco: async () => BANCO, servidor: lerServidor, portaEsperada: () => 55432 });
    await g.bancoParaEscrita();
    await g.bancoParaEscrita();
    expect(lerServidor).toHaveBeenCalledTimes(1);

    ambiente = { liberada: false, trava: "MODO_LOCAL", motivo: "mudou" };
    await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
  });

  it("servidor recusado é lido de novo na próxima chamada", async () => {
    const lerServidor = vi
      .fn<() => Promise<LeituraDoServidor>>()
      .mockResolvedValueOnce({ ...SERVIDOR_LOCAL, marcador: null })
      .mockResolvedValue(SERVIDOR_LOCAL);
    const g = criarGuardaDeEscrita({ ambiente: () => ABERTO, banco: async () => BANCO, servidor: lerServidor, portaEsperada: () => 55432 });
    await expect(g.bancoParaEscrita()).rejects.toBeInstanceOf(EscritaDesligadaError);
    await expect(g.bancoParaEscrita()).resolves.toBe(BANCO);
  });

  it("a tela recebe a mensagem de escrita desligada, sem detalhe técnico", () => {
    expect(mensagemDoErro(new EscritaDesligadaError("DATABASE_URL não aponta para localhost."))).toBe(MENSAGEM_ESCRITA_DESLIGADA);
  });
});
