import { describe, expect, it } from "vitest";

import { PRECO_DO_LITRO_PADRAO_CENTAVOS, precoDoLitro, precoDoLitroDoStaff, type RegraDeCusto } from "../regras";

const regra = (categoria: string, valorCentavos: number | null) => ({ categoria, valorCentavos }) as RegraDeCusto;

describe("preço do litro no formulário do staff", () => {
  it("sem regra de combustível vale o padrão de R$ 6,50: a pessoa não escolhe", () => {
    expect(PRECO_DO_LITRO_PADRAO_CENTAVOS).toBe(650);
    expect(precoDoLitro([regra("REMUNERACAO", 60000)])).toBeNull();
    expect(precoDoLitroDoStaff([regra("REMUNERACAO", 60000)])).toBe(650);
    expect(precoDoLitroDoStaff([])).toBe(650);
  });

  it("com regra de combustível cadastrada pela líder, vale a regra", () => {
    expect(precoDoLitroDoStaff([regra("COMBUSTIVEL", 619)])).toBe(619);
    expect(precoDoLitroDoStaff([regra("COMBUSTIVEL", null)])).toBe(650);
  });
});
