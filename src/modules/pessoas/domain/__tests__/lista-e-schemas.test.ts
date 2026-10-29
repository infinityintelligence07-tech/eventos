import { describe, expect, it } from "vitest";

import type { PerfilDoStaff } from "../cadastro";
import { filtrarStaff, type FiltrosDaLista, lerFiltrosDaLista, limiteDaLista, type StaffNaLista } from "../lista";
import { definirFuncoesSchema, salvarCoordenadasSchema, salvarPerfilDoStaffSchema, salvarVeiculoSchema } from "../schemas";

const ID = "7e570000-0000-7000-8000-000000000001";
const F1 = "7e570000-0000-7000-8000-0000000000f1";
const F2 = "7e570000-0000-7000-8000-0000000000f2";

const perfil: PerfilDoStaff = {
  sexo: "F",
  camisetaModelo: "CAMISETA",
  camisetaTamanho: "P",
  possuiCamiseta: true,
  fezConfronto: false,
  temCnpj: null,
  lat: 1,
  lng: 2,
};

const pessoa = (pessoaId: string, nome: string, mudancas: Partial<StaffNaLista> = {}): StaffNaLista => ({
  pessoaId,
  nome,
  ativo: true,
  poloCodigo: "AM",
  poloNome: "Americana",
  perfil,
  funcoes: [{ funcaoId: F1, codigo: "STAFF", nome: "Staff", nivel: "HABILITADO" }],
  veiculo: null,
  ultimoEvento: null,
  ...mudancas,
});

const lista = [
  pessoa("a", "Ágata Lima"),
  pessoa("b", "Bruno", { poloCodigo: "POA", veiculo: { lugares: 4, consumoKmL: 11 } }),
  pessoa("c", "Carla", { ativo: false, perfil: { ...perfil, fezConfronto: true } }),
  pessoa("d", "Diego", { funcoes: [], perfil: { ...perfil, sexo: null } }),
];

describe("lista de pessoas", () => {
  it("lê os filtros da URL com padrões seguros", () => {
    expect(lerFiltrosDaLista({})).toEqual({ busca: null, polo: null, funcao: null, situacao: "ativas", mostrar: null });
    expect(lerFiltrosDaLista({ busca: "  ana ", situacao: "todas", mostrar: "com-carro", polo: "AM" })).toEqual({
      busca: "ana",
      polo: "AM",
      funcao: null,
      situacao: "todas",
      mostrar: "com-carro",
    });
    expect(lerFiltrosDaLista({ situacao: "apagadas", mostrar: ["x"] })).toMatchObject({ situacao: "ativas", mostrar: null });
  });

  const base: FiltrosDaLista = { busca: null, polo: null, funcao: null, situacao: "ativas", mostrar: null };

  it.each<[Partial<FiltrosDaLista>, string[]]>([
    [{}, ["a", "b", "d"]],
    [{ situacao: "inativas" }, ["c"]],
    [{ situacao: "todas" }, ["a", "b", "c", "d"]],
    [{ busca: "agata" }, ["a"]],
    [{ polo: "POA" }, ["b"]],
    [{ funcao: "STAFF" }, ["a", "b"]],
    [{ mostrar: "incompleto" }, ["d"]],
    [{ mostrar: "com-carro" }, ["b"]],
    [{ mostrar: "fez-confronto", situacao: "todas" }, ["c"]],
  ])("filtros %o", (filtros, esperadas) => {
    expect(filtrarStaff(lista, { ...base, ...filtros }).map((item) => item.pessoaId)).toEqual(esperadas);
  });

  it("calcula as pendências de cada pessoa", () => {
    expect(filtrarStaff(lista, base).find((item) => item.pessoaId === "d")?.pendencias).toEqual(["SEXO", "FUNCAO"]);
  });

  it.each<[string | undefined, number]>([
    [undefined, 50],
    ["abc", 50],
    ["10", 50],
    ["100", 100],
    ["120", 150],
    ["99999", 1000],
  ])("limite %s → %s", (valor, esperado) => {
    expect(limiteDaLista(valor)).toBe(esperado);
  });
});

describe("schemas da ficha", () => {
  it("perfil: vazio vira null e sim/não vira booleano", () => {
    expect(salvarPerfilDoStaffSchema.parse({ pessoaId: ID, sexo: "M", possuiCamiseta: "SIM", fezConfronto: "NAO" })).toEqual({
      pessoaId: ID,
      sexo: "M",
      camisetaModelo: null,
      camisetaTamanho: null,
      possuiCamiseta: true,
      fezConfronto: false,
      temCnpj: null,
    });
    expect(salvarPerfilDoStaffSchema.safeParse({ pessoaId: ID, camisetaTamanho: "XXG" }).success).toBe(false);
  });

  it("funções: ignora caixas desmarcadas, nível padrão habilitado, recusa repetida", () => {
    expect(
      definirFuncoesSchema.parse({ pessoaId: ID, funcoes: [{ funcaoId: F1, nivel: "TRAINEE" }, { nivel: "HABILITADO" }, undefined, { funcaoId: F2 }] }),
    ).toEqual({
      pessoaId: ID,
      funcoes: [
        { funcaoId: F1, nivel: "TRAINEE" },
        { funcaoId: F2, nivel: "HABILITADO" },
      ],
    });
    expect(definirFuncoesSchema.parse({ pessoaId: ID })).toEqual({ pessoaId: ID, funcoes: [] });
    expect(definirFuncoesSchema.safeParse({ pessoaId: ID, funcoes: [{ funcaoId: F1 }, { funcaoId: F1 }] }).success).toBe(false);
  });

  it("veículo: com carro exige lugares 1..8 e aceita consumo com vírgula; sem carro só a pessoa", () => {
    expect(salvarVeiculoSchema.parse({ pessoaId: ID, temCarro: "SIM", lugares: "4", consumoKmL: "10,5" })).toEqual({
      pessoaId: ID,
      temCarro: "SIM",
      lugares: 4,
      consumoKmL: 10.5,
    });
    expect(salvarVeiculoSchema.parse({ pessoaId: ID, temCarro: "SIM", lugares: "5" })).toMatchObject({ consumoKmL: null });
    expect(salvarVeiculoSchema.parse({ pessoaId: ID, temCarro: "NAO", lugares: "99" })).toEqual({ pessoaId: ID, temCarro: "NAO" });
    for (const invalido of [{ lugares: "9" }, { lugares: "0" }, { lugares: "2.5" }, { lugares: "4", consumoKmL: "0" }, { lugares: "4", consumoKmL: "dez" }]) {
      expect(salvarVeiculoSchema.safeParse({ pessoaId: ID, temCarro: "SIM", ...invalido }).success).toBe(false);
    }
  });

  it("coordenadas: faixas válidas, vírgula aceita", () => {
    expect(salvarCoordenadasSchema.parse({ pessoaId: ID, lat: "-22,7349", lng: "-47.3311" })).toEqual({ pessoaId: ID, lat: -22.7349, lng: -47.3311 });
    expect(salvarCoordenadasSchema.safeParse({ pessoaId: ID, lat: "-91", lng: "0" }).success).toBe(false);
    expect(salvarCoordenadasSchema.safeParse({ pessoaId: ID, lat: "0", lng: "181" }).success).toBe(false);
  });
});
