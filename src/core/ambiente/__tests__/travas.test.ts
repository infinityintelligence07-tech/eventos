import { describe, expect, it } from "vitest";

import { bancoLocalDaUrl } from "@/core/config/banco-local";

import {
  type AmbienteDeEscrita,
  type LeituraDoServidor,
  MARCADOR_DO_BANCO_LOCAL,
  verificarAmbiente,
  verificarAtor,
  verificarMarcador,
  verificarServidor,
} from "..";

const LOCAL: AmbienteDeEscrita = {
  NODE_ENV: "development",
  EVENTOS_MODO: "local",
  DATABASE_URL: "postgresql://postgres@localhost:55432/eventos_local",
};

describe("travas 1 e 2 do ambiente", () => {
  it("libera com modo local, fora de produção e banco em localhost", () => {
    expect(verificarAmbiente(LOCAL)).toEqual({ liberada: true, modo: "LOCAL" });
    expect(verificarAmbiente({ ...LOCAL, NODE_ENV: "test" })).toEqual({ liberada: true, modo: "LOCAL" });
    expect(verificarAmbiente({ ...LOCAL, DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/x" }).liberada).toBe(true);
    expect(verificarAmbiente({ ...LOCAL, DATABASE_URL: "postgresql://postgres@[::1]:55432/x" }).liberada).toBe(true);
  });

  it("trava 1: recusa sem EVENTOS_MODO=local", () => {
    expect(verificarAmbiente({ ...LOCAL, EVENTOS_MODO: undefined })).toMatchObject({ liberada: false, trava: "MODO_LOCAL" });
  });

  it("trava 1: recusa com NODE_ENV=production, mesmo em modo local", () => {
    expect(verificarAmbiente({ ...LOCAL, NODE_ENV: "production" })).toMatchObject({ liberada: false, trava: "MODO_LOCAL" });
  });

  it("trava 2: recusa banco fora de localhost", () => {
    for (const url of [
      "postgresql://postgres@db.supabase.co:5432/postgres",
      "postgresql://postgres@localhost.exemplo.com:5432/postgres",
      "postgresql://postgres@10.0.0.5:5432/postgres",
      "isto não é url",
    ]) {
      expect(verificarAmbiente({ ...LOCAL, DATABASE_URL: url })).toMatchObject({ liberada: false, trava: "HOST_LOCAL" });
    }
  });
});

describe("trava 2: URL que diz localhost mas desvia a conexão", () => {
  it.each([
    "postgresql://u:p@localhost/x?host=db.supabase.co",
    "postgresql://u:p@localhost/x?host=remoto.com&options=-c%20eventos.ambiente%3Dlocal",
    "postgresql://u:p@localhost/x?options=-c%20eventos.ambiente%3Dlocal",
    "postgresql://u:p@localhost/x?HOST=remoto.com",
    "postgresql://u:p@localhost/x?hostaddr=10.0.0.5",
    "postgresql://u:p@localhost/x?host=/var/run/postgresql",
    "postgresql://u:p@localhost,remoto.com/x",
    "postgresql://u:p@localhost.remoto.com/x",
  ])("recusa %s", (url) => {
    expect(verificarAmbiente({ ...LOCAL, DATABASE_URL: url })).toMatchObject({ liberada: false, trava: "HOST_LOCAL" });
  });

  it("aceita os parâmetros que não mudam o servidor nem a sessão", () => {
    expect(verificarAmbiente({ ...LOCAL, DATABASE_URL: "postgresql://postgres@localhost:55432/eventos_local?sslmode=disable" })).toEqual({ liberada: true, modo: "LOCAL" });
    expect(bancoLocalDaUrl("postgresql://postgres@localhost:55432/eventos_local")).toEqual({ host: "localhost", porta: 55432 });
    expect(bancoLocalDaUrl("postgresql://postgres@[::1]/eventos_local")).toEqual({ host: "::1", porta: 5432 });
  });
});

describe("trava 3: servidor da conexão", () => {
  const servidor: LeituraDoServidor = { marcador: "local", endereco: "127.0.0.1", porta: 55432 };

  it.each<[LeituraDoServidor, number | null, string | null]>([
    [servidor, 55432, null],
    [{ ...servidor, endereco: "::1" }, 55432, null],
    [{ marcador: "local", endereco: null, porta: null }, 55432, null],
    [servidor, null, null],
    [{ ...servidor, marcador: null }, 55432, "MARCADOR_NO_BANCO"],
    [{ ...servidor, endereco: "172.16.0.9" }, 55432, "SERVIDOR_LOCAL"],
    [{ ...servidor, porta: 5432 }, 55432, "SERVIDOR_LOCAL"],
  ])("%o com porta esperada %s → %s", (leitura, porta, trava) => {
    const resultado = verificarServidor(leitura, porta);
    if (trava === null) expect(resultado).toEqual({ liberada: true, modo: "LOCAL" });
    else expect(resultado).toMatchObject({ liberada: false, trava });
  });
});

describe("trava 3: marcador no banco", () => {
  it("libera só com o valor exato do banco local", () => {
    expect(verificarMarcador(MARCADOR_DO_BANCO_LOCAL)).toEqual({ liberada: true, modo: "LOCAL" });
  });

  it("recusa marcador ausente ou diferente", () => {
    for (const valor of [null, undefined, "", "producao", "LOCAL", " local"]) {
      expect(verificarMarcador(valor)).toMatchObject({ liberada: false, trava: "MARCADOR_NO_BANCO" });
    }
  });
});

describe("modo PRODUCAO: travas 1 e 2 no ambiente", () => {
  const PRODUCAO: AmbienteDeEscrita = {
    NODE_ENV: "production",
    EVENTOS_MODO: undefined,
    EVENTOS_ESCRITA: "producao",
    DATABASE_URL: "postgresql://app_eventos_leitura.ref:x@pooler.supabase.com:6543/postgres",
    DATABASE_URL_ESCRITA: "postgresql://app_eventos.ref:y@pooler.supabase.com:6543/postgres",
  };

  it("libera com NODE_ENV=production, EVENTOS_ESCRITA=producao e conexão própria de escrita", () => {
    expect(verificarAmbiente(PRODUCAO)).toEqual({ liberada: true, modo: "PRODUCAO" });
  });

  it.each<[string, Partial<AmbienteDeEscrita>, string]>([
    ["next dev (NODE_ENV=development)", { NODE_ENV: "development" }, "MODO_PRODUCAO"],
    ["NODE_ENV=test", { NODE_ENV: "test" }, "MODO_PRODUCAO"],
    ["sem DATABASE_URL_ESCRITA", { DATABASE_URL_ESCRITA: undefined }, "PAPEL_DE_ESCRITA"],
    ["escrita na mesma conexão da leitura", { DATABASE_URL_ESCRITA: PRODUCAO.DATABASE_URL }, "PAPEL_DE_ESCRITA"],
    ["escrita com options=-c role=app_eventos", { DATABASE_URL_ESCRITA: "postgresql://postgres.ref:y@pooler.supabase.com:6543/postgres?options=-c%20role%3Dapp_eventos" }, "PAPEL_DE_ESCRITA"],
    ["escrita com host na query", { DATABASE_URL_ESCRITA: "postgresql://app_eventos.ref:y@pooler.supabase.com:6543/postgres?host=outro.com" }, "PAPEL_DE_ESCRITA"],
    ["escrita com hostaddr", { DATABASE_URL_ESCRITA: "postgresql://app_eventos.ref:y@pooler.supabase.com:6543/postgres?hostaddr=10.0.0.5" }, "PAPEL_DE_ESCRITA"],
    ["escrita com dois hosts", { DATABASE_URL_ESCRITA: "postgresql://app_eventos.ref:y@pooler.supabase.com,outro.com:6543/postgres" }, "PAPEL_DE_ESCRITA"],
    ["escrita com URL inválida", { DATABASE_URL_ESCRITA: "não é url" }, "PAPEL_DE_ESCRITA"],
    ["EVENTOS_MODO=local junto", { EVENTOS_MODO: "local" }, "MODO_PRODUCAO"],
    ["sem EVENTOS_ESCRITA (npm run dev com o .env de hoje)", { EVENTOS_ESCRITA: undefined }, "MODO_LOCAL"],
  ])("%s recusa", (_caso, mudanca, trava) => {
    expect(verificarAmbiente({ ...PRODUCAO, ...mudanca })).toMatchObject({ liberada: false, trava });
  });
});

describe("modo PRODUCAO: trava 3 no servidor", () => {
  const servidor: LeituraDoServidor = { marcador: null, marcadorDoPapel: "producao", papel: "app_eventos", endereco: "10.0.0.9", porta: 6543 };

  it.each<[LeituraDoServidor, string | null]>([
    [servidor, null],
    [{ ...servidor, papel: "postgres" }, "PAPEL_DE_ESCRITA"],
    [{ ...servidor, papel: null }, "PAPEL_DE_ESCRITA"],
    [{ ...servidor, marcadorDoPapel: null }, "MARCADOR_NO_PAPEL"],
    [{ ...servidor, marcadorDoPapel: "local" }, "MARCADOR_NO_PAPEL"],
    [{ ...servidor, marcador: "local" }, "MARCADOR_NO_PAPEL"],
  ])("%o → %s", (leitura, trava) => {
    const resultado = verificarServidor(leitura, null, "PRODUCAO");
    if (trava === null) expect(resultado).toEqual({ liberada: true, modo: "PRODUCAO" });
    else expect(resultado).toMatchObject({ liberada: false, trava });
  });

  it("no modo LOCAL, papel com marcador de produção recusa", () => {
    expect(verificarServidor({ marcador: "local", marcadorDoPapel: "producao", endereco: "127.0.0.1", porta: 55432 }, 55432, "LOCAL")).toMatchObject({
      liberada: false,
      trava: "MARCADOR_NO_PAPEL",
    });
  });
});

describe("trava 4: ator", () => {
  const sessao = { usuarioId: "u", pessoaId: null, origem: "SESSAO" as const };
  const local = { ...sessao, origem: "LOCAL" as const };

  it("PRODUCAO só com ator de sessão; LOCAL aceita ator local ou de sessão; sem ator recusa nos dois", () => {
    expect(verificarAtor("PRODUCAO", sessao)).toEqual({ liberada: true, modo: "PRODUCAO" });
    expect(verificarAtor("PRODUCAO", local)).toMatchObject({ liberada: false, trava: "ATOR" });
    expect(verificarAtor("PRODUCAO", null)).toMatchObject({ liberada: false, trava: "ATOR" });
    for (const ator of [sessao, local]) expect(verificarAtor("LOCAL", ator)).toEqual({ liberada: true, modo: "LOCAL" });
    expect(verificarAtor("LOCAL", null)).toMatchObject({ liberada: false, trava: "ATOR" });
  });
});
