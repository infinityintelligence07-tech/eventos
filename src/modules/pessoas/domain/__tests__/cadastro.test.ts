import { describe, expect, it } from "vitest";

import {
  type ModeloDeCamiseta,
  type NivelNaFuncao,
  type PendenciaDoCadastro,
  pendenciasDoCadastro,
  type PerfilDoStaff,
  rotuloDaCamiseta,
  rotuloDaFuncao,
  rotuloDaPendencia,
  rotuloDoNivel,
  rotuloDoSexo,
  rotuloDoVeiculo,
  rotuloSimNao,
  type Sexo,
} from "../cadastro";
import { contaComoTrabalho, rotuloDaSituacaoNaEscala, type SituacaoNaEscala } from "../historico";

const completo: PerfilDoStaff = {
  sexo: "F",
  camisetaModelo: "BABY_LOOK",
  camisetaTamanho: "M",
  possuiCamiseta: true,
  fezConfronto: true,
  temCnpj: false,
  lat: -22.7,
  lng: -47.3,
};
const funcao = [{ funcaoId: "f1", codigo: "STAFF", nome: "Staff", nivel: "HABILITADO" as const }];

describe("o que falta no cadastro", () => {
  it("cadastro completo não tem pendência", () => {
    expect(pendenciasDoCadastro({ perfil: completo, funcoes: funcao, veiculo: { lugares: 4, consumoKmL: 10.5 } })).toEqual([]);
    expect(pendenciasDoCadastro({ perfil: completo, funcoes: funcao, veiculo: null })).toEqual([]);
  });

  it.each<[Partial<PerfilDoStaff>, boolean, number | null | undefined, PendenciaDoCadastro[]]>([
    [{ sexo: null }, true, undefined, ["SEXO"]],
    [{ camisetaTamanho: null }, true, undefined, ["CAMISETA"]],
    [{}, false, undefined, ["FUNCAO"]],
    [{ lat: null }, true, undefined, ["LOCALIZACAO"]],
    [{}, true, null, ["CONSUMO_DO_CARRO"]],
    [{ sexo: null, camisetaModelo: null, lng: null }, false, null, ["SEXO", "CAMISETA", "FUNCAO", "LOCALIZACAO", "CONSUMO_DO_CARRO"]],
  ])("%o, com função %s, consumo %s → %o", (mudanca, comFuncao, consumo, esperadas) => {
    const veiculo = consumo === undefined ? null : { lugares: 4, consumoKmL: consumo };
    expect(pendenciasDoCadastro({ perfil: { ...completo, ...mudanca }, funcoes: comFuncao ? funcao : [], veiculo })).toEqual(esperadas);
  });

  it("rótulos das pendências", () => {
    expect(["SEXO", "CAMISETA", "FUNCAO", "LOCALIZACAO", "CONSUMO_DO_CARRO"].map((item) => rotuloDaPendencia(item as PendenciaDoCadastro))).toEqual([
      "Falta informar o sexo",
      "Falta camiseta",
      "Falta função",
      "Falta localização",
      "Falta consumo do carro",
    ]);
    expect(() => rotuloDaPendencia("PIX" as PendenciaDoCadastro)).toThrow(/desconhecida/);
  });
});

describe("rótulos", () => {
  it("camiseta, função, veículo e sim/não", () => {
    expect(rotuloDaCamiseta("BABY_LOOK", "M")).toBe("Baby look M");
    expect(rotuloDaCamiseta("CAMISETA", null)).toBe("Camiseta");
    expect(rotuloDaCamiseta(null, "G")).toBe("Tamanho G");
    expect(rotuloDaCamiseta(null, null)).toBeNull();
    expect(rotuloDaFuncao({ nome: "Pai / mãe", nivel: "TRAINEE" })).toBe("Pai / mãe · trainee");
    expect(rotuloDaFuncao({ nome: "Staff", nivel: "HABILITADO" })).toBe("Staff");
    expect(rotuloDoVeiculo({ lugares: 1, consumoKmL: null })).toBe("1 lugar");
    expect(rotuloDoVeiculo({ lugares: 4, consumoKmL: null })).toBe("4 lugares");
    expect(rotuloDoVeiculo(null)).toBeNull();
    expect([true, false, null].map(rotuloSimNao)).toEqual(["Sim", "Não", "—"]);
    expect(rotuloDoSexo("F")).toBe("Feminino");
    expect(rotuloDoNivel("TRAINEE")).toBe("Trainee");
  });

  it("valores fora do CHECK são erro de programação", () => {
    expect(() => rotuloDoSexo("X" as Sexo)).toThrow(/desconhecido/);
    expect(() => rotuloDoNivel("SENIOR" as NivelNaFuncao)).toThrow(/desconhecido/);
    expect(() => rotuloDaCamiseta("REGATA" as ModeloDeCamiseta, null)).toThrow(/desconhecido/);
  });
});

describe("histórico", () => {
  it.each<[SituacaoNaEscala, string, boolean]>([
    ["SUGERIDA", "Na escala (não avisada)", true],
    ["CONVIDADA", "Aguardando resposta", true],
    ["ACEITA", "Confirmou", true],
    ["RECUSADA", "Não pode", false],
    ["CANCELADA", "Removida", false],
  ])("%s → %s (conta como trabalho: %s)", (situacao, rotulo, conta) => {
    expect(rotuloDaSituacaoNaEscala(situacao)).toBe(rotulo);
    expect(contaComoTrabalho(situacao)).toBe(conta);
  });

  it("valor do GH fora do CHECK é erro de programação", () => {
    expect(() => rotuloDaSituacaoNaEscala("ESCALADA" as SituacaoNaEscala)).toThrow(/desconhecida/);
  });
});
