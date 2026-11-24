import { describe, expect, it } from "vitest";

import { dimensoesReduzidas, LADO_MAXIMO_DA_IMAGEM, nomeComoJpeg, reduzirImagem, SO_REDUZ_ACIMA_DE } from "../_componentes/reduzir-imagem";

describe("redução da foto do comprovante no navegador", () => {
  it("mantém a proporção, limita o lado maior e nunca aumenta", () => {
    expect(LADO_MAXIMO_DA_IMAGEM).toBe(2000);
    expect(dimensoesReduzidas(4000, 3000)).toEqual({ largura: 2000, altura: 1500 });
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1500, altura: 2000 });
    expect(dimensoesReduzidas(1200, 800)).toEqual({ largura: 1200, altura: 800 });
    expect(dimensoesReduzidas(2000, 2000)).toEqual({ largura: 2000, altura: 2000 });
    expect(dimensoesReduzidas(12000, 3)).toEqual({ largura: 2000, altura: 1 });
    expect(dimensoesReduzidas(0, 0)).toEqual({ largura: 0, altura: 0 });
  });

  it("o arquivo reduzido sai como .jpg", () => {
    expect(nomeComoJpeg("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(nomeComoJpeg("foto.do.cupom.png")).toBe("foto.do.cupom.jpg");
    expect(nomeComoJpeg("semextensao")).toBe("semextensao.jpg");
    expect(nomeComoJpeg(".png")).toBe("comprovante.jpg");
  });

  it("PDF e foto leve vão como estão; sem canvas (ou com imagem que o navegador não abre), a foto também", async () => {
    const pdf = new File([new Uint8Array(SO_REDUZ_ACIMA_DE + 10)], "recibo.pdf", { type: "application/pdf" });
    expect(await reduzirImagem(pdf)).toBe(pdf);
    const leve = new File([new Uint8Array(1000)], "foto.jpg", { type: "image/jpeg" });
    expect(await reduzirImagem(leve)).toBe(leve);
    // No Node não existe createImageBitmap: cai no "como está", que é o que acontece num navegador sem suporte.
    const pesada = new File([new Uint8Array(SO_REDUZ_ACIMA_DE + 10)], "foto.jpg", { type: "image/jpeg" });
    expect(await reduzirImagem(pesada)).toBe(pesada);
  });
});
