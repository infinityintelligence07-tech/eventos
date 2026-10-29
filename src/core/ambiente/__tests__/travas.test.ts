import { describe, expect, it } from "vitest";

import { bancoLocalDaUrl } from "@/core/config/banco-local";

import { type AmbienteDeEscrita, type LeituraDoServidor, MARCADOR_DO_BANCO_LOCAL, verificarAmbiente, verificarMarcador, verificarServidor } from "..";

const LOCAL: AmbienteDeEscrita = {
  NODE_ENV: "development",
  EVENTOS_MODO: "local",
  DATABASE_URL: "postgresql://postgres@localhost:55432/eventos_local",
};

describe("travas 1 e 2 do ambiente", () => {
  it("libera com modo local, fora de produção e banco em localhost", () => {
    expect(verificarAmbiente(LOCAL)).toEqual({ liberada: true });
    expect(verificarAmbiente({ ...LOCAL, NODE_ENV: "test" })).toEqual({ liberada: true });
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
    expect(verificarAmbiente({ ...LOCAL, DATABASE_URL: "postgresql://postgres@localhost:55432/eventos_local?sslmode=disable" })).toEqual({ liberada: true });
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
    if (trava === null) expect(resultado).toEqual({ liberada: true });
    else expect(resultado).toMatchObject({ liberada: false, trava });
  });
});

describe("trava 3: marcador no banco", () => {
  it("libera só com o valor exato do banco local", () => {
    expect(verificarMarcador(MARCADOR_DO_BANCO_LOCAL)).toEqual({ liberada: true });
  });

  it("recusa marcador ausente ou diferente", () => {
    for (const valor of [null, undefined, "", "producao", "LOCAL", " local"]) {
      expect(verificarMarcador(valor)).toMatchObject({ liberada: false, trava: "MARCADOR_NO_BANCO" });
    }
  });
});
