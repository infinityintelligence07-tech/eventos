import { describe, expect, it } from "vitest";

import { funcoesDepoisDoStaff, meuCadastroSchema, pedidoDeLocalizacao } from "../meu-cadastro";

const A = "0193a3f0-0000-7000-8000-00000000000a";
const B = "0193a3f0-0000-7000-8000-00000000000b";
const C = "0193a3f0-0000-7000-8000-00000000000c";

const valido = {
  poloCodigo: "CPS",
  sexo: "F",
  camisetaModelo: "BABY_LOOK",
  camisetaTamanho: "M",
  funcoes: [A],
  cep: "13015-001",
  logradouro: " Rua   Barão de Jaguara ",
  numero: "100",
  bairro: "Centro",
  cidade: "Campinas",
  uf: "sp",
  temCarro: "NAO",
};

describe("meu cadastro: formulário", () => {
  it("normaliza CEP, UF e espaços", () => {
    const lido = meuCadastroSchema.parse(valido);
    expect(lido).toMatchObject({ cep: "13015001", uf: "SP", logradouro: "Rua Barão de Jaguara", lugares: null, consumoKmL: null });
  });

  it("exige polo, sexo, camiseta, cidade e UF; com carro, os lugares", () => {
    const erros = (dados: Record<string, unknown>) => meuCadastroSchema.safeParse(dados).error?.issues.map((issue) => issue.path[0]) ?? [];
    expect(erros({ ...valido, poloCodigo: "", sexo: undefined, camisetaTamanho: "XXL" })).toEqual(expect.arrayContaining(["poloCodigo", "sexo", "camisetaTamanho"]));
    expect(erros({ ...valido, cidade: "", uf: "" })).toEqual(expect.arrayContaining(["cidade", "uf"]));
    expect(erros({ ...valido, temCarro: "SIM" })).toEqual(["lugares"]);
    expect(meuCadastroSchema.parse({ ...valido, temCarro: "SIM", lugares: "3", consumoKmL: "10,5" })).toMatchObject({ lugares: 3, consumoKmL: 10.5 });
    expect(erros({ ...valido, temCarro: "SIM", lugares: "9", consumoKmL: "abc" })).toEqual(expect.arrayContaining(["lugares", "consumoKmL"]));
    expect(erros({ ...valido, cep: "123" })).toEqual(["cep"]);
  });

  it("funções só como uuid (nada de código forjado)", () => {
    expect(meuCadastroSchema.safeParse({ ...valido, funcoes: ["LIDER"] }).success).toBe(false);
  });
});

describe("meu cadastro: funções sugeridas pelo staff", () => {
  it("nova entra como TRAINEE, habilitada pelo time fica mesmo desmarcada, TRAINEE desmarcada sai", () => {
    const atuais = [
      { funcaoId: A, nivel: "HABILITADO" as const },
      { funcaoId: B, nivel: "TRAINEE" as const },
    ];
    expect(funcoesDepoisDoStaff(atuais, [C])).toEqual([
      { funcaoId: A, nivel: "HABILITADO" },
      { funcaoId: C, nivel: "TRAINEE" },
    ]);
    expect(funcoesDepoisDoStaff(atuais, [A, B])).toEqual(atuais);
  });
});

describe("meu cadastro: o que pedir ao mapa", () => {
  const endereco = { logradouro: "Rua A", numero: "10", cidade: "Campinas", uf: "SP", cep: "13015001" };

  it("com rua e número: o endereço, com o CEP de reserva", () => {
    expect(pedidoDeLocalizacao(endereco, true)).toEqual({ tipo: "ENDERECO", rua: "Rua A", numero: "10", cidade: "Campinas", uf: "SP", cep: "13015001" });
  });

  it("sem rua ou número: o CEP só para quem ainda não tem localização; senão, não recalcula", () => {
    const soCep = { ...endereco, logradouro: null, numero: null };
    expect(pedidoDeLocalizacao(soCep, false)).toEqual({ tipo: "CEP", cep: "13015001" });
    expect(pedidoDeLocalizacao(soCep, true)).toBeNull();
    expect(pedidoDeLocalizacao({ ...endereco, numero: null }, false)).toEqual({ tipo: "CEP", cep: "13015001" });
    expect(pedidoDeLocalizacao({ ...soCep, cep: null }, false)).toBeNull();
  });
});
