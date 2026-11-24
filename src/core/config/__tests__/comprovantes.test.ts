import { describe, expect, it } from "vitest";

import { lerComprovantesDoAmbiente, VARIAVEIS_DOS_COMPROVANTES } from "../comprovantes";

const completo = {
  COMPROVANTES_S3_ENDPOINT: "https://projeto.storage.supabase.co/storage/v1/s3",
  COMPROVANTES_S3_REGIAO: "sa-east-1",
  COMPROVANTES_S3_BUCKET: "eventos-comprovantes",
  COMPROVANTES_S3_CHAVE_ID: "chave-de-teste",
  COMPROVANTES_S3_CHAVE_SEGREDO: "segredo-de-teste",
};
const ambiente = (mudanca: Record<string, string | undefined> = {}) => ({ NODE_ENV: "production", ...completo, ...mudanca }) as NodeJS.ProcessEnv;

describe("configuração do armazenamento dos comprovantes", () => {
  it("sem nenhuma variável (ou todas vazias), o anexo fica desligado", () => {
    expect(lerComprovantesDoAmbiente({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual({ situacao: "DESLIGADO" });
    expect(lerComprovantesDoAmbiente(ambiente(Object.fromEntries(VARIAVEIS_DOS_COMPROVANTES.map((nome) => [nome, "  "]))))).toEqual({ situacao: "DESLIGADO" });
  });

  it("com as cinco, fica configurado", () => {
    expect(lerComprovantesDoAmbiente(ambiente())).toEqual({
      situacao: "CONFIGURADO",
      config: { endpoint: completo.COMPROVANTES_S3_ENDPOINT, regiao: "sa-east-1", bucket: "eventos-comprovantes", chaveId: "chave-de-teste", segredo: "segredo-de-teste" },
    });
  });

  it("faltando alguma, fica desligado e diz só o nome do que falta", () => {
    const leitura = lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_CHAVE_SEGREDO: "", COMPROVANTES_S3_REGIAO: undefined }));
    expect(leitura).toEqual({ situacao: "INCOMPLETO", faltando: ["COMPROVANTES_S3_CHAVE_SEGREDO", "COMPROVANTES_S3_REGIAO"] });
    expect(JSON.stringify(leitura)).not.toContain("chave-de-teste");
  });

  it("endpoint precisa ser https (http só no próprio computador), sem credencial nem parâmetro na URL", () => {
    const invalido = { situacao: "INCOMPLETO", faltando: ["COMPROVANTES_S3_ENDPOINT"] };
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_ENDPOINT: "http://projeto.storage.supabase.co/storage/v1/s3" }))).toEqual(invalido);
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_ENDPOINT: "nao-e-url" }))).toEqual(invalido);
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_ENDPOINT: "https://usuario:senha@projeto.storage.supabase.co/storage/v1/s3" }))).toEqual(invalido);
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_ENDPOINT: "https://projeto.storage.supabase.co/storage/v1/s3?x=1" }))).toEqual(invalido);
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_ENDPOINT: "http://localhost:9000" })).situacao).toBe("CONFIGURADO");
  });

  it("bucket com nome fora do padrão é recusado", () => {
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_BUCKET: "Eventos Comprovantes" }))).toEqual({ situacao: "INCOMPLETO", faltando: ["COMPROVANTES_S3_BUCKET"] });
    expect(lerComprovantesDoAmbiente(ambiente({ COMPROVANTES_S3_BUCKET: "../outro" }))).toEqual({ situacao: "INCOMPLETO", faltando: ["COMPROVANTES_S3_BUCKET"] });
  });
});
