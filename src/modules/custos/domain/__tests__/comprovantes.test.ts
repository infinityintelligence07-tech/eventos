import { describe, expect, it } from "vitest";

import { chaveDoComprovante, conferirArquivo, MAXIMO_DE_COMPROVANTES, nomeParaMostrar, TAMANHO_MAXIMO_DO_COMPROVANTE, tamanhoLegivel, tipoPelosBytes } from "../comprovantes";

const texto = (valor: string) => new Uint8Array(Buffer.from(valor, "latin1"));
const com = (inicio: number[], resto = "conteudo") => new Uint8Array([...inicio, ...Buffer.from(resto, "latin1")]);

describe("comprovantes: tipo pelo conteúdo do arquivo", () => {
  it("reconhece JPEG, PNG, WebP e PDF pelos primeiros bytes", () => {
    expect(tipoPelosBytes(com([0xff, 0xd8, 0xff, 0xe1]))).toBe("image/jpeg");
    expect(tipoPelosBytes(com([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(tipoPelosBytes(new Uint8Array([...texto("RIFF"), 1, 2, 3, 4, ...texto("WEBPVP8 ")]))).toBe("image/webp");
    expect(tipoPelosBytes(texto("%PDF-1.4\n%âãÏÓ"))).toBe("application/pdf");
  });

  it("não aceita o que só parece: RIFF de áudio, PNG cortado, HTML, SVG, GIF, ZIP, HEIC e executável", () => {
    expect(tipoPelosBytes(new Uint8Array([...texto("RIFF"), 1, 2, 3, 4, ...texto("WAVEfmt ")]))).toBeNull();
    expect(tipoPelosBytes(com([0x89, 0x50, 0x4e, 0x47], ""))).toBeNull();
    expect(tipoPelosBytes(texto("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(tipoPelosBytes(texto('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toBeNull();
    expect(tipoPelosBytes(texto("GIF89a"))).toBeNull();
    expect(tipoPelosBytes(com([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    expect(tipoPelosBytes(new Uint8Array([0, 0, 0, 0x18, ...texto("ftypheic")]))).toBeNull();
    expect(tipoPelosBytes(com([0x4d, 0x5a]))).toBeNull();
    // "%PDF" sem o hífen e texto que só contém a assinatura mais adiante.
    expect(tipoPelosBytes(texto("%PDF1.4"))).toBeNull();
    expect(tipoPelosBytes(texto(" %PDF-1.4"))).toBeNull();
    expect(tipoPelosBytes(new Uint8Array(0))).toBeNull();
  });

  it("confere o tamanho pelo conteúdo: vazio, até 8 MB e acima", () => {
    expect(MAXIMO_DE_COMPROVANTES).toBe(3);
    expect(TAMANHO_MAXIMO_DO_COMPROVANTE).toBe(8 * 1024 * 1024);
    expect(conferirArquivo(new Uint8Array(0))).toEqual({ recusa: "VAZIO" });
    const noLimite = new Uint8Array(TAMANHO_MAXIMO_DO_COMPROVANTE);
    noLimite.set(texto("%PDF-1.7"));
    expect(conferirArquivo(noLimite)).toEqual({ tipo: "application/pdf" });
    const acima = new Uint8Array(TAMANHO_MAXIMO_DO_COMPROVANTE + 1);
    acima.set(texto("%PDF-1.7"));
    expect(conferirArquivo(acima)).toEqual({ recusa: "GRANDE_DEMAIS" });
    expect(conferirArquivo(texto("planilha"))).toEqual({ recusa: "TIPO_NAO_ACEITO" });
  });
});

describe("comprovantes: nome do objeto e nome mostrado", () => {
  const eventoId = "0192f0c0-0000-7000-8000-000000000001";
  const id = "7f1f2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

  it("a chave só tem os ids e a extensão do tipo conferido", () => {
    expect(chaveDoComprovante({ eventoId, id, tipo: "image/jpeg" })).toBe(`custos/${eventoId}/${id}.jpg`);
    expect(chaveDoComprovante({ eventoId, id, tipo: "application/pdf" })).toBe(`custos/${eventoId}/${id}.pdf`);
    expect(() => chaveDoComprovante({ eventoId: "../../etc", id, tipo: "image/png" })).toThrow();
    expect(() => chaveDoComprovante({ eventoId, id: "a/b", tipo: "image/png" })).toThrow();
  });

  it("o nome mostrado perde a pasta, os caracteres de controle e o excesso", () => {
    expect(nomeParaMostrar("C:\\Users\\ana\\Fotos\\cupom  do posto.JPG", "image/jpeg")).toBe("cupom do posto.JPG");
    expect(nomeParaMostrar("../../../etc/passwd", "application/pdf")).toBe("passwd");
    expect(nomeParaMostrar('rec\u0000ibo<script>"x".pdf', "application/pdf")).toBe("reciboscriptx.pdf");
    expect(nomeParaMostrar("...", "image/png")).toBe("comprovante.png");
    expect(nomeParaMostrar("", "image/webp")).toBe("comprovante.webp");
    expect(nomeParaMostrar(`${"a".repeat(300)}.jpg`, "image/jpeg")).toHaveLength(120);
  });

  it("tamanho legível", () => {
    expect(tamanhoLegivel(300)).toBe("1 kB");
    expect(tamanhoLegivel(348_160)).toBe("340 kB");
    expect(tamanhoLegivel(1_258_291)).toBe("1,2 MB");
    expect(tamanhoLegivel(8 * 1024 * 1024)).toBe("8 MB");
  });
});
