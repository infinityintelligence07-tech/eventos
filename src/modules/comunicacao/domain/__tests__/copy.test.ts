import { describe, expect, it } from "vitest";

import { modelosCopyDaMigration } from "@/test/seeds";

import {
  formatarDataEHora,
  formatarHorario,
  formatarPeriodo,
  gerarCopy,
  ondePreencher,
  primeiroNome,
  rotuloDaVariavel,
  saudacao,
  validarModelo,
} from "../copy";

const modelos = modelosCopyDaMigration();

const dados = {
  saudacao: "Boa tarde",
  link_custos: "https://eventos.iam/custos/abc",
  evento: { tipo: "Confronto", codigo: "CONF_AM_60", cidade: "Manaus", data: "12 a 14 de dezembro", horario: "7h" },
  local: { nome: "Centro de Convenções" },
  pessoa: { nome: "Maria da Silva", funcao: "Mãe", deslocamento: "Voo", sexo: "F" },
  hospedagem: { hotel: "Hotel Central", endereco: "Av. Brasil, 100", colega: "Ana" },
};

describe("modelos cadastrados no banco", () => {
  it("são válidos", () => {
    expect(Object.keys(modelos).sort()).toEqual(["ESCALACAO", "HOSPEDAGEM"]);
    for (const [tipo, corpo] of Object.entries(modelos)) {
      expect(validarModelo(corpo), tipo).toEqual([]);
    }
  });

  it("hospedagem sai completa com os dados da pessoa", () => {
    const copy = gerarCopy(modelos.HOSPEDAGEM!, dados);
    expect(copy.pronta).toBe(true);
    expect(copy.texto).toContain("Boa tarde! Tudo bem?");
    expect(copy.texto).toContain("CIDADE: Manaus - Centro de Convenções");
    expect(copy.texto).toContain("Colega de quarto: Ana");
    expect(copy.texto).not.toContain("{{");
  });
});

describe("gerarCopy", () => {
  it("aponta o que falta e deixa visível no texto", () => {
    const copy = gerarCopy("Hotel: {{hospedagem.hotel}} | Colega: {{hospedagem.colega}}", {
      hospedagem: { hotel: "  ", colega: null },
    });
    expect(copy.pronta).toBe(false);
    expect(copy.faltando).toEqual(["hospedagem.colega", "hospedagem.hotel"]);
    expect(copy.texto).toBe("Hotel: {{hospedagem.hotel}} | Colega: {{hospedagem.colega}}");
  });

  it("concorda o gênero pela pessoa", () => {
    const modelo = "Você está {{genero:ESCALADO|ESCALADA|ESCALADO(A)}}!";
    expect(gerarCopy(modelo, { pessoa: { sexo: "F" } }).texto).toBe("Você está ESCALADA!");
    expect(gerarCopy(modelo, { pessoa: { sexo: "M" } }).texto).toBe("Você está ESCALADO!");
    expect(gerarCopy(modelo, {}).texto).toBe("Você está ESCALADO(A)!");
    const semNeutro = gerarCopy("{{genero:pai|mãe}}", {});
    expect(semNeutro.faltando).toEqual(["pessoa.sexo"]);
  });

  it("não lê objeto nem propriedade herdada como valor", () => {
    expect(gerarCopy("{{evento}}", dados).faltando).toEqual(["evento"]);
    expect(gerarCopy("{{evento.constructor}}", dados).faltando).toEqual(["evento.constructor"]);
  });

  it("aceita número e ignora espaços no marcador", () => {
    expect(gerarCopy("{{ evento.vagas }} vagas", { evento: { vagas: 0 } }).texto).toBe("0 vagas");
  });

  it("o hash só muda quando muda um dado usado pelo modelo", () => {
    const modelo = "{{pessoa.nome}} em {{evento.cidade}}";
    const base = gerarCopy(modelo, dados).dadosHash;
    expect(gerarCopy(modelo, { ...dados, hospedagem: { hotel: "Outro" } }).dadosHash).toBe(base);
    expect(gerarCopy(modelo, { ...dados, evento: { ...dados.evento, cidade: "Belém" } }).dadosHash).not.toBe(base);
  });
});

describe("validarModelo", () => {
  it("acusa variável inexistente, marcador quebrado e chave sem par", () => {
    expect(validarModelo("{{evento.cidad}}")).toEqual(["O campo {{evento.cidad}} não existe. Use os botões de Inserir campo."]);
    expect(validarModelo("{{genero:só}}")).toHaveLength(1);
    expect(validarModelo("Olá {{pessoa.nome}")).toEqual(["Há {{ ou }} sem par."]);
  });

  it("aceita os campos de voo", () => {
    expect(validarModelo("Ida: {{voo.ida}} | Volta: {{voo.volta}}")).toEqual([]);
  });
});

describe("partes da copy e catálogo de campos", () => {
  it("marca o lugar de cada dado que falta, para a tela destacar", () => {
    const copy = gerarCopy("Oi {{pessoa.primeiro_nome}}, voo: {{voo.ida}}.", { pessoa: { primeiro_nome: "Ana" } });
    expect(copy.partes).toEqual([
      { tipo: "texto", texto: "Oi Ana, voo: " },
      { tipo: "falta", variavel: "voo.ida", original: "{{voo.ida}}" },
      { tipo: "texto", texto: "." },
    ]);
    expect(copy.texto).toBe("Oi Ana, voo: {{voo.ida}}.");
  });

  it("o gênero sem sexo aponta o sexo da pessoa", () => {
    const copy = gerarCopy("Você está {{genero:ESCALADO|ESCALADA}}", { pessoa: { sexo: null } });
    expect(copy.partes.at(-1)).toEqual({ tipo: "falta", variavel: "pessoa.sexo", original: "{{genero:ESCALADO|ESCALADA}}" });
  });

  it("rótulo e lugar de preenchimento de cada campo", () => {
    expect(rotuloDaVariavel("voo.ida")).toBe("voo de ida");
    expect(rotuloDaVariavel("pessoa.sexo")).toBe("sexo da pessoa");
    expect(rotuloDaVariavel("inventado")).toBe("inventado");
    expect(ondePreencher("voo.ida")).toBe("LOGISTICA");
    expect(ondePreencher("link_custos")).toBe("CONFIGURACOES");
    expect(ondePreencher("inventado")).toBeNull();
  });

  it("a saudação não entra no hash (muda com a hora, não com os dados)", () => {
    const modelo = "{{saudacao}}, {{pessoa.nome}}";
    const manha = gerarCopy(modelo, { ...dados, saudacao: "Bom dia" });
    const noite = gerarCopy(modelo, { ...dados, saudacao: "Boa noite" });
    expect(manha.texto).not.toBe(noite.texto);
    expect(manha.dadosHash).toBe(noite.dadosHash);
  });
});

describe("formatação", () => {
  it("saudação pelo horário de Brasília", () => {
    expect(saudacao(new Date("2026-10-26T11:00:00Z"))).toBe("Bom dia"); // 8h
    expect(saudacao(new Date("2026-10-26T15:00:00Z"))).toBe("Boa tarde"); // 12h
    expect(saudacao(new Date("2026-10-26T21:00:00Z"))).toBe("Boa noite"); // 18h
    expect(saudacao(new Date("2026-10-26T06:00:00Z"))).toBe("Boa noite"); // 3h
  });

  it("período do evento", () => {
    expect(formatarPeriodo("2026-12-12")).toBe("12 de dezembro");
    expect(formatarPeriodo("2026-12-12", "2026-12-14")).toBe("12 a 14 de dezembro");
    expect(formatarPeriodo("2026-11-30", "2026-12-02")).toBe("30 de novembro a 2 de dezembro");
    expect(formatarPeriodo("2026-12-30", "2027-01-02")).toBe("30 de dezembro de 2026 a 2 de janeiro de 2027");
    expect(() => formatarPeriodo("12/12/2026")).toThrow();
  });

  it("primeiro nome", () => {
    expect(primeiroNome("MARIA DA SILVA")).toBe("Maria");
    expect(primeiroNome("  joão pedro ")).toBe("João");
  });

  it("horário de chegada", () => {
    expect(formatarHorario("08:00")).toBe("8h");
    expect(formatarHorario("07:30:00")).toBe("7h30");
    expect(() => formatarHorario("oito")).toThrow();
  });

  it("data e hora no horário de Brasília", () => {
    expect(formatarDataEHora(new Date("2026-12-11T11:10:00Z"))).toBe("11/12 às 08:10");
  });
});
