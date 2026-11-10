import { describe, expect, it, vi } from "vitest";

import { localizarCep, localizarEndereco, LocalizacaoError } from "../localizacao";

const responde = (corpo: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
const semEspera = { esperar: async () => undefined };
const endereco = { rua: "Rua Barão de Jaguara", numero: "100", cidade: "Campinas", uf: "SP", cep: "13015001" };

describe("Nominatim (endereço)", () => {
  it("busca estruturada no Brasil, se identifica e devolve a primeira coordenada", async () => {
    const fetch = responde([{ lat: "-22.9119646", lon: "-47.0552611" }]);
    await expect(localizarEndereco(endereco, { fetch, ...semEspera })).resolves.toEqual({ lat: -22.9119646, lng: -47.0552611 });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      countrycodes: "br",
      street: "100 Rua Barão de Jaguara",
      city: "Campinas",
      state: "SP",
      postalcode: "13015-001",
      limit: "1",
    });
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/^EventosIAM\//);
  });

  it("não achou = nulo; HTTP ou formato errado = erro", async () => {
    await expect(localizarEndereco(endereco, { fetch: responde([]), ...semEspera })).resolves.toBeNull();
    await expect(localizarEndereco(endereco, { fetch: responde({}, 429), ...semEspera })).rejects.toBeInstanceOf(LocalizacaoError);
    await expect(localizarEndereco(endereco, { fetch: responde({ x: 1 }), ...semEspera })).rejects.toThrow(/fora do formato/);
  });

  it("respeita 1 pedido por segundo (política do Nominatim)", async () => {
    let relogio = 1_000_000;
    const esperas: number[] = [];
    const opcoes = {
      fetch: responde([]),
      agora: () => relogio,
      esperar: async (ms: number) => {
        esperas.push(ms);
        relogio += ms;
      },
    };
    await Promise.all([localizarEndereco(endereco, opcoes), localizarEndereco(endereco, opcoes)]);
    expect(esperas.at(-1)).toBe(1100);
  });
});

describe("BrasilAPI (ponto do CEP)", () => {
  it("devolve a coordenada do CEP", async () => {
    const fetch = responde({ cep: "13015001", location: { type: "Point", coordinates: { longitude: "-47.06083", latitude: "-22.90556" } } });
    await expect(localizarCep("13015001", { fetch })).resolves.toEqual({ lat: -22.90556, lng: -47.06083 });
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toBe("https://brasilapi.com.br/api/cep/v2/13015001");
  });

  it("CEP sem coordenada ou inexistente = nulo; erro do servidor = erro", async () => {
    await expect(localizarCep("13015001", { fetch: responde({ location: { type: "Point", coordinates: {} } }) })).resolves.toBeNull();
    await expect(localizarCep("13015001", { fetch: responde({ location: { coordinates: { latitude: "", longitude: "" } } }) })).resolves.toBeNull();
    await expect(localizarCep("00000000", { fetch: responde({ message: "não encontrado" }, 404) })).resolves.toBeNull();
    await expect(localizarCep("13015001", { fetch: responde({}, 500) })).rejects.toBeInstanceOf(LocalizacaoError);
  });
});
