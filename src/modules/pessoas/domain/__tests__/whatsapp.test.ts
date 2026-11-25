import { describe, expect, it } from "vitest";

import { linkDoWhatsApp, telefoneParaWhatsApp } from "../whatsapp";

// Telefones inventados (9999-0000 e parecidos): nenhum é de pessoa real.

describe("telefone do cadastro no formato do WhatsApp", () => {
  it("aceita celular com DDD do jeito que as pessoas digitam", () => {
    for (const telefone of [
      "11999990000",
      "(11) 99999-0000",
      " 11 99999-0000 ",
      "11 9 9999 0000",
      "11.99999.0000",
      "011 99999-0000",
      "(011) 99999-0000",
      "+55 11 99999-0000",
      "+55 (11) 99999-0000",
      "+5511999990000",
      "+55 (011) 99999-0000",
      "55 11 99999-0000",
      "5511999990000",
      "0055 11 99999-0000",
    ]) {
      expect(telefoneParaWhatsApp(telefone), telefone).toBe("5511999990000");
    }
  });

  it("celular anotado com 8 dígitos ganha o nono dígito; fixo segue com 8", () => {
    expect(telefoneParaWhatsApp("(11) 9999-0000")).toBe("5511999990000");
    expect(telefoneParaWhatsApp("+55 51 8888-0000")).toBe("5551988880000");
    expect(telefoneParaWhatsApp("551170000000")).toBe("5511970000000");
    expect(telefoneParaWhatsApp("(11) 3333-0000")).toBe("551133330000");
    expect(telefoneParaWhatsApp("+55 92 2222-0000")).toBe("559222220000");
  });

  it("o DDD 55 não se confunde com o código do país", () => {
    expect(telefoneParaWhatsApp("(55) 99999-0000")).toBe("5555999990000");
    expect(telefoneParaWhatsApp("55 3333-0000")).toBe("555533330000");
    expect(telefoneParaWhatsApp("+55 55 99999-0000")).toBe("5555999990000");
    expect(telefoneParaWhatsApp("5555999990000")).toBe("5555999990000");
    // Com "+55" e sem DDD: não dá para tomar o 55 por DDD.
    expect(telefoneParaWhatsApp("+55 99999-0000")).toBeNull();
    expect(telefoneParaWhatsApp("+55 9999-0000")).toBeNull();
  });

  it("devolve nulo quando não dá para ter certeza do número", () => {
    for (const telefone of [
      null,
      undefined,
      "",
      "   ",
      "não tem",
      "99999-0000", // sem DDD
      "3333-0000",
      "(11) 9999-000", // faltou dígito
      "(11) 99999-00000", // sobrou dígito
      "(11) 89999-0000", // 9 dígitos sem começar por 9
      "(11) 1999-0000", // 8 dígitos começando por 1
      "(10) 99999-0000", // DDD que não existe
      "(20) 99999-0000",
      "(00) 99999-0000",
      "0800 123 4567",
      "+351 912 345 678", // outro país
      "+1 (212) 555-0100",
      "(11) 99999-0000 / (11) 3333-0000", // dois telefones no mesmo campo
      "015 11 99999-0000", // código de operadora
    ]) {
      expect(telefoneParaWhatsApp(telefone), String(telefone)).toBeNull();
    }
  });
});

describe("link do WhatsApp com a mensagem escrita", () => {
  const texto = (link: string | null) => new URL(link!).searchParams.get("text");

  it("monta o wa.me com o número completo e o texto codificado", () => {
    expect(linkDoWhatsApp("(11) 99999-0000", "Olá, Ana!")).toBe("https://wa.me/5511999990000?text=Ol%C3%A1%2C%20Ana!");
  });

  it("acentos, quebras de linha, emoji, & e # chegam inteiros do outro lado", () => {
    const mensagem = ["Olá, João!", "", "Solicitação aprovada 🎉👍🏽", "Combustível & pedágio: R$ 1.537,35 (protocolo #STF-202612-0008)", "100% + 1 = ok? a/b *negrito* \"aspas\""].join("\n");
    const link = linkDoWhatsApp("+55 11 99999-0000", mensagem)!;
    expect(texto(link)).toBe(mensagem);
    // Nada do texto fica solto no endereço: um & ou # cru cortaria a mensagem.
    const depoisDoTexto = link.slice(link.indexOf("?text=") + "?text=".length);
    expect(depoisDoTexto).not.toMatch(/[&#\s]/);
    expect(depoisDoTexto).toContain("%0A%0A");
    expect(depoisDoTexto).toContain("%26");
    expect(depoisDoTexto).toContain("%23");
    expect(new URL(link).hash).toBe("");
    expect([...new URL(link).searchParams.keys()]).toEqual(["text"]);
  });

  it("metade de emoji solta não derruba a página", () => {
    const cortada = "Olá 🎉".slice(0, -1);
    expect(texto(linkDoWhatsApp("11999990000", cortada))).toBe("Olá �");
  });

  it("sem telefone válido não há link", () => {
    expect(linkDoWhatsApp(null, "Olá")).toBeNull();
    expect(linkDoWhatsApp("99999-0000", "Olá")).toBeNull();
  });
});
