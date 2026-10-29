import { describe, expect, it } from "vitest";

import { alertasDoConsumo, calcularDeslocamento, calcularSolicitacao, depreciacaoDaFaixa, piorNivel, totalDoItem } from "../calculo";
import { type RegraDeCusto, regrasAplicaveis, regrasDoCalculo, vigenciaNaData } from "../regras";

function regra(parcial: Partial<RegraDeCusto> & Pick<RegraDeCusto, "categoria" | "codigo">): RegraDeCusto {
  return {
    id: `${parcial.codigo}-${parcial.vigenteDesde ?? "2026-10-22"}-${parcial.tipoEventoId ?? "*"}-${parcial.uf ?? "*"}`,
    nome: parcial.codigo,
    tipoEventoId: null,
    uf: null,
    unidade: "EVENTO",
    valorCentavos: null,
    parametros: {},
    vigenteDesde: "2026-10-22",
    ativo: true,
    observacao: null,
    ...parcial,
  };
}

// Valores da migration 0002 (planilha de 22/10/2026).
const REGRAS_DA_CARGA: RegraDeCusto[] = [
  regra({ categoria: "DEPRECIACAO", codigo: "FAIXA_ATE_99", unidade: "DESLOCAMENTO", valorCentavos: 0, parametros: { km_min: 0, km_max: 99.99 } }),
  regra({ categoria: "DEPRECIACAO", codigo: "FAIXA_100_249", unidade: "DESLOCAMENTO", valorCentavos: 8000, parametros: { km_min: 100, km_max: 249.99 } }),
  regra({ categoria: "DEPRECIACAO", codigo: "FAIXA_250", unidade: "DESLOCAMENTO", valorCentavos: 25000, parametros: { km_min: 250 } }),
  regra({ categoria: "LIMITE", codigo: "CONSUMO_CRITICO", unidade: "NENHUMA", parametros: { km_l_min: 7.5, km_l_max: 22, custo_km_max_centavos: 95 } }),
  regra({ categoria: "LIMITE", codigo: "CONSUMO_ALERTA", unidade: "NENHUMA", parametros: { km_l_min: 10, custo_km_max_centavos: 70 } }),
];
const REGRAS = regrasDoCalculo(REGRAS_DA_CARGA);

describe("depreciação por faixa de km rodados (doc 03)", () => {
  it.each<[number, number]>([
    [0, 0],
    [99.9, 0],
    [100, 8000],
    [249.9, 8000],
    [250, 25000],
    [1200, 25000],
  ])("%s km → %s centavos", (km, centavos) => {
    expect(depreciacaoDaFaixa(km, REGRAS.faixas)?.valorCentavos).toBe(centavos);
  });
});

describe("alertas do doc 03", () => {
  it.each<[string, number, number, { nivel: string; regra: string; mensagem: string }[]]>([
    ["consumo e custo normais", 12, 619, []],
    ["consumo abaixo de 10 (alerta)", 9.4, 619, [{ nivel: "ALERTA", regra: "CONSUMO_BAIXO", mensagem: "Consumo de 9,4 km/l está abaixo do limite de 10 km/l." }]],
    ["10 km/l exatos não alerta", 10, 619, []],
    [
      "consumo abaixo de 7,5 (crítico) e custo por km acima de 0,70",
      6.8,
      500,
      [
        { nivel: "CRITICO", regra: "CONSUMO_BAIXO", mensagem: "Consumo de 6,8 km/l está abaixo do limite de 7,5 km/l." },
        { nivel: "ALERTA", regra: "CUSTO_POR_KM", mensagem: "Custo de R$\u00a00,74 por km está acima do limite de R$\u00a00,70." },
      ],
    ],
    ["consumo acima de 22 (crítico)", 23, 619, [{ nivel: "CRITICO", regra: "CONSUMO_ALTO", mensagem: "Consumo de 23,0 km/l está acima do limite de 22 km/l." }]],
    ["7,5 exatos é só alerta", 7.5, 500, [{ nivel: "ALERTA", regra: "CONSUMO_BAIXO", mensagem: "Consumo de 7,5 km/l está abaixo do limite de 10 km/l." }]],
    [
      "custo por km acima de 0,95 (crítico)",
      12,
      1224,
      [{ nivel: "CRITICO", regra: "CUSTO_POR_KM", mensagem: "Custo de R$\u00a01,02 por km está acima do limite de R$\u00a00,95." }],
    ],
    ["custo por km de exatos 0,70 não alerta", 10, 700, []],
    [
      "custo que arredondaria para o limite mostra a casa que passa dele",
      6.5,
      619,
      [
        { nivel: "CRITICO", regra: "CONSUMO_BAIXO", mensagem: "Consumo de 6,5 km/l está abaixo do limite de 7,5 km/l." },
        { nivel: "CRITICO", regra: "CUSTO_POR_KM", mensagem: "Custo de R$\u00a00,952 por km está acima do limite de R$\u00a00,95." },
      ],
    ],
    [
      "alerta de custo logo acima de 0,70",
      8.8,
      619,
      [
        { nivel: "ALERTA", regra: "CONSUMO_BAIXO", mensagem: "Consumo de 8,8 km/l está abaixo do limite de 10 km/l." },
        { nivel: "ALERTA", regra: "CUSTO_POR_KM", mensagem: "Custo de R$\u00a00,703 por km está acima do limite de R$\u00a00,70." },
      ],
    ],
  ])("%s", (_caso, consumo, preco, esperado) => {
    expect(alertasDoConsumo(consumo, preco, REGRAS.limites).map(({ nivel, regra: nome, mensagem }) => ({ nivel, regra: nome, mensagem }))).toEqual(esperado);
  });

  it("sem regra de limite, sem alerta", () => {
    expect(alertasDoConsumo(3, 2000, regrasDoCalculo([]).limites)).toEqual([]);
  });

  it("pior nível", () => {
    expect(piorNivel([])).toBe("NENHUM");
    expect(piorNivel(["ALERTA", "NENHUM"])).toBe("ALERTA");
    expect(piorNivel(["ALERTA", "CRITICO"])).toBe("CRITICO");
  });
});

describe("cálculo do deslocamento", () => {
  it.each([
    {
      caso: "ida e volta conta os dois trechos e o pedágio duas vezes",
      entrada: { km: 206, idaVolta: true, consumoKmL: 12, precoLitroCentavos: 619, pedagioCentavos: 1250 },
      esperado: { kmRodados: 412, combustivelCentavos: 21252, pedagioCentavos: 2500, depreciacaoCentavos: 25000, totalCentavos: 48752, nivel: "NENHUM" },
    },
    {
      caso: "só ida",
      entrada: { km: 150.5, idaVolta: false, consumoKmL: 9, precoLitroCentavos: 619, pedagioCentavos: 0 },
      esperado: { kmRodados: 150.5, combustivelCentavos: 10351, pedagioCentavos: 0, depreciacaoCentavos: 8000, totalCentavos: 18351, nivel: "ALERTA" },
    },
    {
      caso: "km zero",
      entrada: { km: 0, idaVolta: true, consumoKmL: 12, precoLitroCentavos: 619, pedagioCentavos: 0 },
      esperado: { kmRodados: 0, combustivelCentavos: 0, pedagioCentavos: 0, depreciacaoCentavos: 0, totalCentavos: 0, nivel: "NENHUM" },
    },
  ])("$caso", ({ entrada, esperado }) => {
    expect(calcularDeslocamento(entrada, REGRAS)).toMatchObject(esperado);
  });

  it("itens: unitário × quantidade, em centavos", () => {
    expect(totalDoItem({ quantidade: 1, valorCentavos: 27000 })).toBe(27000);
    expect(totalDoItem({ quantidade: 2.5, valorCentavos: 7000 })).toBe(17500);
    expect(totalDoItem({ quantidade: 0.33, valorCentavos: 100 })).toBe(33);
  });

  it("solicitação: soma deslocamentos e itens; km total e o pior nível", () => {
    const calculada = calcularSolicitacao(
      {
        deslocamentos: [
          { km: 206, idaVolta: true, consumoKmL: 12, precoLitroCentavos: 619, pedagioCentavos: 1250 },
          { km: 30.3, idaVolta: false, consumoKmL: 6.5, precoLitroCentavos: 619, pedagioCentavos: 0 },
        ],
        itens: [
          { quantidade: 1, valorCentavos: 60000 },
          { quantidade: 1, valorCentavos: 27000 },
        ],
      },
      REGRAS,
    );
    expect(calculada.kmTotal).toBe(442.3);
    expect(calculada.deslocamentos[1]).toMatchObject({ combustivelCentavos: 2885, nivel: "CRITICO" });
    expect(calculada.totalCentavos).toBe(48752 + 2885 + 60000 + 27000);
    expect(calculada.nivel).toBe("CRITICO");
  });
});

describe("regra que vale na data", () => {
  const conf = "tipo-conf";
  const vigencias = [
    regra({ categoria: "ALIMENTACAO", codigo: "ALIMENTACAO", tipoEventoId: conf, valorCentavos: 36000, vigenteDesde: "2026-10-22" }),
    regra({ categoria: "ALIMENTACAO", codigo: "ALIMENTACAO", tipoEventoId: conf, valorCentavos: 40000, vigenteDesde: "2026-12-01" }),
  ];

  it.each<[string, number | null]>([
    ["2026-10-01", null],
    ["2026-10-22", 36000],
    ["2026-11-30", 36000],
    ["2026-12-01", 40000],
  ])("em %s vale %s", (dataDoEvento, valor) => {
    expect(vigenciaNaData(vigencias, dataDoEvento)?.valorCentavos ?? null).toBe(valor);
  });

  it("vigência desativada desliga a regra a partir dela", () => {
    const desativada = [vigencias[0]!, { ...vigencias[1]!, ativo: false }];
    expect(vigenciaNaData(desativada, "2026-11-15")?.valorCentavos).toBe(36000);
    expect(vigenciaNaData(desativada, "2026-12-15")).toBeNull();
  });

  it("aplicáveis: grupo mais específico ganha; outro tipo ou UF não entra", () => {
    const regras = [
      ...vigencias,
      regra({ categoria: "ALIMENTACAO", codigo: "ALIMENTACAO", tipoEventoId: "tipo-asm", valorCentavos: 27000 }),
      regra({ categoria: "COMBUSTIVEL", codigo: "LITRO", unidade: "LITRO", valorCentavos: 600 }),
      regra({ categoria: "COMBUSTIVEL", codigo: "LITRO", unidade: "LITRO", uf: "AM", valorCentavos: 650 }),
      regra({ categoria: "COMBUSTIVEL", codigo: "LITRO", unidade: "LITRO", uf: "RS", valorCentavos: 610 }),
    ];
    const aplicaveis = regrasAplicaveis(regras, { tipoEventoId: conf, uf: "AM", data: "2026-11-10" });
    expect(aplicaveis.map((item) => [item.codigo, item.valorCentavos]).sort()).toEqual([
      ["ALIMENTACAO", 36000],
      ["LITRO", 650],
    ]);
  });
});
