import { describe, expect, it } from "vitest";

import {
  aeroportoAoAlterar,
  aeroportoAoRegistrar,
  aeroportosDoTrecho,
  cidadeComUf,
  cidadesDoTrecho,
  mesmaCidade,
  type PontasDoTrecho,
  rotaDoTrecho,
  rotaPorExtenso,
  textoDoPedidoDeVoo,
} from "../pedido";
import { alterarPedidoSchema, registrarCompraDeVooPelaSdcSchema, registrarPedidoDeVooSchema, registrarRetornoDeVooSchema } from "../schemas";

// Pedido de voo sem aeroporto (26/11/2026): o time pede por cidade; a SDC escolhe o aeroporto e informa na compra.
// Pedido antigo só tem os aeroportos e continua aparecendo.

const id = "7e570000-0000-7000-8000-000000000002";
const novo: PontasDoTrecho = { origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", origemIata: null, destinoIata: null };
const comprado: PontasDoTrecho = { ...novo, origemIata: "POA", destinoIata: "MAO" };
const antigo: PontasDoTrecho = { origemCidade: null, destinoCidade: null, origemIata: "POA", destinoIata: "MAO" };

describe("de onde para onde: cidade e aeroporto", () => {
  it("cidade com UF, como no cadastro da pessoa e no local do evento", () => {
    expect(cidadeComUf("Porto Alegre", "RS")).toBe("Porto Alegre (RS)");
    expect(cidadeComUf(" Manaus ", "am")).toBe("Manaus (AM)");
    expect(cidadeComUf("Manaus", null)).toBe("Manaus");
    expect([cidadeComUf(null, "RS"), cidadeComUf("  ", "RS"), cidadeComUf(undefined, undefined)]).toEqual([null, null, null]);
  });

  it("mostra a cidade enquanto não há aeroporto e o aeroporto quando há; o pedido antigo só tem aeroporto", () => {
    expect(rotaDoTrecho(novo)).toBe("Porto Alegre (RS) → Manaus (AM)");
    expect(rotaDoTrecho(comprado)).toBe("POA → MAO");
    expect(rotaDoTrecho(antigo)).toBe("POA → MAO");
    // A SDC informou só um dos dois.
    expect(rotaDoTrecho({ ...novo, origemIata: "POA" })).toBe("POA → Manaus (AM)");

    expect([cidadesDoTrecho(novo), cidadesDoTrecho(comprado), cidadesDoTrecho(antigo)]).toEqual(["Porto Alegre (RS) → Manaus (AM)", "Porto Alegre (RS) → Manaus (AM)", null]);
    expect([aeroportosDoTrecho(novo), aeroportosDoTrecho(comprado), aeroportosDoTrecho(antigo)]).toEqual([null, "POA → MAO", "POA → MAO"]);
    expect(aeroportosDoTrecho({ ...novo, destinoIata: "MAO" })).toBe("— → MAO");

    expect(rotaPorExtenso(novo)).toBe("Porto Alegre (RS) → Manaus (AM)");
    expect(rotaPorExtenso(comprado)).toBe("Porto Alegre (RS) → Manaus (AM) (aeroportos POA → MAO)");
    expect(rotaPorExtenso(antigo)).toBe("POA → MAO");
  });

  it("texto do pedido para a SDC: cidades no pedido novo, aeroportos no antigo, os dois depois da compra", () => {
    const texto = (pontas: PontasDoTrecho) =>
      textoDoPedidoDeVoo({
        referencia: "SDC-000007",
        eventoCodigo: "ASM_AM_235",
        eventoNome: "ASM",
        passageiro: "Staff 07",
        observacaoTime: null,
        trechos: [{ sentido: "IDA", ...pontas, dataDesejada: "2026-11-05", preferenciaHorario: "MANHA" }],
      }).split("\n")[3];
    expect(texto(novo)).toBe("Ida: Porto Alegre (RS) → Manaus (AM) em 05/11/2026 (manhã)");
    expect(texto(antigo)).toBe("Ida: POA → MAO em 05/11/2026 (manhã)");
    expect(texto(comprado)).toBe("Ida: Porto Alegre (RS) → Manaus (AM) (aeroportos POA → MAO) em 05/11/2026 (manhã)");
  });

  it("comparar cidades ignora maiúsculas, acentos, pontuação e espaços", () => {
    expect(mesmaCidade("São Paulo (SP)", "  sao  paulo - sp ")).toBe(true);
    expect(mesmaCidade("Porto Alegre (RS)", "Porto Velho (RO)")).toBe(false);
  });
});

describe("o aeroporto de cada ponta", () => {
  it("ao alterar o pedido: fica se a cidade não mudou (ou se o trecho é antigo, sem cidade); cidade nova fica sem aeroporto", () => {
    expect(aeroportoAoAlterar({ cidade: "Porto Alegre (RS)", iata: "POA" }, "porto alegre (RS)")).toBe("POA");
    expect(aeroportoAoAlterar({ cidade: "Porto Alegre (RS)", iata: "POA" }, "Caxias do Sul (RS)")).toBeNull();
    expect(aeroportoAoAlterar({ cidade: null, iata: "POA" }, "Porto Alegre (RS)")).toBe("POA");
    expect(aeroportoAoAlterar({ cidade: "Porto Alegre (RS)", iata: null }, "Porto Alegre (RS)")).toBeNull();
    // Trecho que o pedido não tinha (acrescentaram a volta).
    expect(aeroportoAoAlterar(null, "Porto Alegre (RS)")).toBeNull();
  });

  it("ao registrar a compra: vale o informado; em branco tira, menos no trecho antigo, que ficaria sem nada", () => {
    expect(aeroportoAoRegistrar({ cidade: "Porto Alegre (RS)", iata: null }, "POA")).toBe("POA");
    expect(aeroportoAoRegistrar({ cidade: "Porto Alegre (RS)", iata: "POA" }, "CXJ")).toBe("CXJ");
    expect(aeroportoAoRegistrar({ cidade: "Porto Alegre (RS)", iata: "POA" }, undefined)).toBeNull();
    expect(aeroportoAoRegistrar({ cidade: null, iata: "POA" }, undefined)).toBe("POA");
    expect(aeroportoAoRegistrar({ cidade: null, iata: "POA" }, "CXJ")).toBe("CXJ");
  });
});

describe("formulários", () => {
  const trecho = { sentido: "IDA", origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", dataDesejada: "2026-11-05" };
  const pedido = (trechos: unknown[]) => registrarPedidoDeVooSchema.safeParse({ eventoId: id, pessoaId: id, trechos });

  it("o pedido do time é por cidade: as duas são obrigatórias e diferentes; o aeroporto não entra", () => {
    const lido = registrarPedidoDeVooSchema.parse({ eventoId: id, pessoaId: id, trechos: [{ ...trecho, origemIata: "POA", destinoIata: "MAO" }] });
    // O aeroporto mandado junto é descartado: o time não informa mais.
    expect(lido.trechos[0]).toEqual({ sentido: "IDA", origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", dataDesejada: "2026-11-05" });

    expect(pedido([{ sentido: "IDA", destinoCidade: "Manaus (AM)", dataDesejada: "2026-11-05" }]).success).toBe(false);
    expect(pedido([{ sentido: "IDA", origemCidade: "Porto Alegre (RS)", dataDesejada: "2026-11-05" }]).success).toBe(false);
    // Só o aeroporto, como era antes, não basta.
    expect(pedido([{ sentido: "IDA", origemIata: "POA", destinoIata: "MAO", dataDesejada: "2026-11-05" }]).success).toBe(false);
    expect(pedido([{ ...trecho, origemCidade: "P" }]).success).toBe(false);
    expect(pedido([{ ...trecho, origemCidade: "x".repeat(81) }]).success).toBe(false);
    // A cidade vai para a SDC e para a copy do staff: uma linha, sem link.
    expect(pedido([{ ...trecho, origemCidade: "Porto Alegre\nRS" }]).success).toBe(false);
    expect(pedido([{ ...trecho, destinoCidade: "www.exemplo.test" }]).success).toBe(false);
    const iguais = pedido([{ ...trecho, destinoCidade: "PORTO ALEGRE (rs)" }]);
    expect(iguais.success ? null : iguais.error.issues[0]).toMatchObject({ path: ["trechos", 0, "destinoCidade"], message: "A origem e o destino precisam ser cidades diferentes." });
  });

  it("alterar o pedido usa o mesmo trecho por cidade", () => {
    const base = { pedidoId: id, atualizadoEm: "2026-10-29T12:00:00.000Z" };
    expect(alterarPedidoSchema.parse({ ...base, trechos: [trecho] }).trechos?.[0]).toMatchObject({ origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)" });
    expect(alterarPedidoSchema.safeParse({ ...base, trechos: [{ sentido: "IDA", origemIata: "POA", destinoIata: "MAO", dataDesejada: "2026-11-05" }] }).success).toBe(false);
  });

  const voo = { sentido: "IDA", companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2026-11-05T08:10", chegadaEm: "2026-11-05T11:45" };
  const doTime = (extra: Record<string, unknown>) => registrarRetornoDeVooSchema.safeParse({ pedidoId: id, valorCentavos: "980,00", trechos: [{ ...voo, ...extra }] });
  const daSdc = (extra: Record<string, unknown>) => registrarCompraDeVooPelaSdcSchema.safeParse({ referencia: "SDC-000007", valorCentavos: "980,00", trechos: [{ ...voo, ...extra }] });

  it.each([
    ["time, em nome da SDC", doTime],
    ["SDC, na área dela", daSdc],
  ])("compra registrada pelo %s: os aeroportos são opcionais, 3 letras em maiúsculas e diferentes", (_quem, compra) => {
    const sem = compra({});
    expect(sem.success && [sem.data.trechos[0]!.origemIata, sem.data.trechos[0]!.destinoIata]).toEqual([undefined, undefined]);
    const com = compra({ origemIata: " poa ", destinoIata: "mao" });
    expect(com.success && [com.data.trechos[0]!.origemIata, com.data.trechos[0]!.destinoIata]).toEqual(["POA", "MAO"]);
    const soUm = compra({ destinoIata: "MAO" });
    expect(soUm.success && [soUm.data.trechos[0]!.origemIata, soUm.data.trechos[0]!.destinoIata]).toEqual([undefined, "MAO"]);
    expect(compra({ origemIata: "PORTO" }).success).toBe(false);
    expect(compra({ origemIata: "P0A" }).success).toBe(false);
    const iguais = compra({ origemIata: "POA", destinoIata: "poa" });
    expect(iguais.success ? null : iguais.error.issues[0]).toMatchObject({ path: ["trechos", 0, "destinoIata"], message: "Origem e destino precisam ser aeroportos diferentes." });
  });
});
