import { describe, expect, it, vi } from "vitest";

import type { LeituraDoServidor, ModoDeEscrita, SituacaoDaEscrita } from "@/core/ambiente";
import type { AtorDaEscrita } from "@/core/autorizacao";
import type { Db } from "@/core/db/database";

import { criarGuardaDeEscrita } from "../banco";
import { EscritaDesligadaError, mensagemDoErro, MENSAGEM_ESCRITA_DESLIGADA } from "../erros";

const BANCO = { nome: "banco falso" } as unknown as Db;
const LOCAL: SituacaoDaEscrita = { liberada: true, modo: "LOCAL" };
const PRODUCAO: SituacaoDaEscrita = { liberada: true, modo: "PRODUCAO" };
const SERVIDOR_LOCAL: LeituraDoServidor = { marcador: "local", marcadorDoPapel: null, papel: "postgres", endereco: "127.0.0.1", porta: 55432 };
const SERVIDOR_PRODUCAO: LeituraDoServidor = { marcador: null, marcadorDoPapel: "producao", papel: "app_eventos", endereco: "10.0.0.9", porta: 6543 };
const SESSAO: AtorDaEscrita = { usuarioId: "u1", pessoaId: "p1", origem: "SESSAO" };
const DO_LOCAL: AtorDaEscrita = { usuarioId: "u1", pessoaId: "p1", origem: "LOCAL" };

function guarda({ ambiente = LOCAL, servidor = SERVIDOR_LOCAL as LeituraDoServidor | Error, portaEsperada = 55432 as number | null } = {}) {
  const banco = vi.fn(async (modo: ModoDeEscrita) => {
    void modo;
    return BANCO;
  });
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

const recusa = async (g: ReturnType<typeof guarda>["guarda"], ator: AtorDaEscrita | null, trava: string) => {
  await expect(g.bancoParaEscrita(ator)).rejects.toBeInstanceOf(EscritaDesligadaError);
  await expect(g.situacao(ator)).resolves.toMatchObject({ liberada: false, trava });
};

describe("modo LOCAL: as três travas de hoje + ator", () => {
  it("libera com as travas abertas, com ator local ou de sessão; sem ator recusa", async () => {
    const { guarda: g } = guarda();
    for (const ator of [DO_LOCAL, SESSAO]) await expect(g.bancoParaEscrita(ator)).resolves.toBe(BANCO);
    await expect(g.situacao()).resolves.toEqual({ liberada: true, modo: "LOCAL" });
    await recusa(g, null, "ATOR");
  });

  it("travas 1 e 2 fechadas: recusa sem tocar no banco", async () => {
    for (const ambiente of [
      { liberada: false, trava: "MODO_LOCAL", motivo: "EVENTOS_MODO não é local." },
      { liberada: false, trava: "HOST_LOCAL", motivo: "fora de localhost" },
    ] as SituacaoDaEscrita[]) {
      const { guarda: g, banco } = guarda({ ambiente });
      await expect(g.bancoParaEscrita(DO_LOCAL)).rejects.toBeInstanceOf(EscritaDesligadaError);
      expect(banco).not.toHaveBeenCalled();
    }
  });

  it.each<[string, LeituraDoServidor, string]>([
    ["marcador ausente", { ...SERVIDOR_LOCAL, marcador: null }, "MARCADOR_NO_BANCO"],
    ["marcador diferente", { ...SERVIDOR_LOCAL, marcador: "producao" }, "MARCADOR_NO_BANCO"],
    ["papel com marcador de produção", { ...SERVIDOR_LOCAL, marcadorDoPapel: "producao" }, "MARCADOR_NO_PAPEL"],
    ["servidor fora do loopback", { ...SERVIDOR_LOCAL, endereco: "10.0.0.5" }, "SERVIDOR_LOCAL"],
    ["porta diferente (túnel)", { ...SERVIDOR_LOCAL, porta: 5432 }, "SERVIDOR_LOCAL"],
  ])("trava 3: %s recusa", async (_caso, servidor, trava) => {
    await recusa(guarda({ servidor }).guarda, DO_LOCAL, trava);
  });

  it("trava 3: socket Unix com marcador libera; erro ao ler o servidor recusa", async () => {
    await expect(guarda({ servidor: { marcador: "local", endereco: null, porta: null } }).guarda.bancoParaEscrita(DO_LOCAL)).resolves.toBe(BANCO);
    await recusa(guarda({ servidor: new Error("conexão recusada") }).guarda, DO_LOCAL, "MARCADOR_NO_BANCO");
  });
});

describe("modo PRODUCAO: quatro travas", () => {
  it("libera com as quatro travas abertas e ator de sessão, no pool de escrita da produção", async () => {
    const { guarda: g, banco } = guarda({ ambiente: PRODUCAO, servidor: SERVIDOR_PRODUCAO });
    await expect(g.bancoParaEscrita(SESSAO)).resolves.toBe(BANCO);
    expect(banco).toHaveBeenCalledWith("PRODUCAO");
    await expect(g.situacao()).resolves.toEqual({ liberada: true, modo: "PRODUCAO" });
  });

  it("trava 1 (next dev, NODE_ENV ≠ production) e trava 2 (sem conexão de escrita): recusa sem tocar no banco", async () => {
    for (const ambiente of [
      { liberada: false, trava: "MODO_PRODUCAO", motivo: "next dev" },
      { liberada: false, trava: "PAPEL_DE_ESCRITA", motivo: "sem DATABASE_URL_ESCRITA" },
    ] as SituacaoDaEscrita[]) {
      const { guarda: g, banco } = guarda({ ambiente, servidor: SERVIDOR_PRODUCAO });
      await expect(g.bancoParaEscrita(SESSAO)).rejects.toBeInstanceOf(EscritaDesligadaError);
      expect(banco).not.toHaveBeenCalled();
    }
  });

  it.each<[string, LeituraDoServidor, string]>([
    ["papel diferente de app_eventos", { ...SERVIDOR_PRODUCAO, papel: "postgres" }, "PAPEL_DE_ESCRITA"],
    ["papel de leitura", { ...SERVIDOR_PRODUCAO, papel: "app_eventos_leitura" }, "PAPEL_DE_ESCRITA"],
    ["papel sem o marcador producao", { ...SERVIDOR_PRODUCAO, marcadorDoPapel: null }, "MARCADOR_NO_PAPEL"],
    ["marcador local presente no banco", { ...SERVIDOR_PRODUCAO, marcador: "local" }, "MARCADOR_NO_PAPEL"],
    ["marcador local no papel", { ...SERVIDOR_PRODUCAO, marcadorDoPapel: "local" }, "MARCADOR_NO_PAPEL"],
  ])("trava 3: %s recusa", async (_caso, servidor, trava) => {
    await recusa(guarda({ ambiente: PRODUCAO, servidor }).guarda, SESSAO, trava);
  });

  it("trava 4: sem sessão (sem ator) ou ator do modo local recusa", async () => {
    const { guarda: g } = guarda({ ambiente: PRODUCAO, servidor: SERVIDOR_PRODUCAO });
    await recusa(g, null, "ATOR");
    await recusa(g, DO_LOCAL, "ATOR");
  });

  it("a porta não é conferida na produção (pooler)", async () => {
    const { guarda: g } = guarda({ ambiente: PRODUCAO, servidor: SERVIDOR_PRODUCAO, portaEsperada: 55432 });
    await expect(g.bancoParaEscrita(SESSAO)).resolves.toBe(BANCO);
  });
});

describe("cache da trava 3", () => {
  it("lê o servidor uma vez quando confere, mas continua checando o ambiente e o ator", async () => {
    let ambiente: SituacaoDaEscrita = PRODUCAO;
    const lerServidor = vi.fn(async () => SERVIDOR_PRODUCAO);
    const g = criarGuardaDeEscrita({ ambiente: () => ambiente, banco: async () => BANCO, servidor: lerServidor, portaEsperada: () => null });
    await g.bancoParaEscrita(SESSAO);
    await g.bancoParaEscrita(SESSAO);
    expect(lerServidor).toHaveBeenCalledTimes(1);
    await expect(g.bancoParaEscrita(DO_LOCAL)).rejects.toBeInstanceOf(EscritaDesligadaError);

    ambiente = { liberada: false, trava: "MODO_PRODUCAO", motivo: "mudou" };
    await expect(g.bancoParaEscrita(SESSAO)).rejects.toBeInstanceOf(EscritaDesligadaError);
  });

  it("servidor recusado é lido de novo na próxima chamada", async () => {
    const lerServidor = vi
      .fn<() => Promise<LeituraDoServidor>>()
      .mockResolvedValueOnce({ ...SERVIDOR_LOCAL, marcador: null })
      .mockResolvedValue(SERVIDOR_LOCAL);
    const g = criarGuardaDeEscrita({ ambiente: () => LOCAL, banco: async () => BANCO, servidor: lerServidor, portaEsperada: () => 55432 });
    await expect(g.bancoParaEscrita(DO_LOCAL)).rejects.toBeInstanceOf(EscritaDesligadaError);
    await expect(g.bancoParaEscrita(DO_LOCAL)).resolves.toBe(BANCO);
  });

  it("a tela recebe a mensagem de escrita desligada, sem detalhe técnico", () => {
    expect(mensagemDoErro(new EscritaDesligadaError("DATABASE_URL não aponta para localhost."))).toBe(MENSAGEM_ESCRITA_DESLIGADA);
  });
});
