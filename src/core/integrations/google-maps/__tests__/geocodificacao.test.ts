import { describe, expect, it, vi } from "vitest";

import { geocodificar, GeocodificacaoError } from "../geocodificacao";

const responde = (corpo: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(corpo), { status }));

describe("geocodificação (Google)", () => {
  it("devolve a primeira coordenada e manda o endereço, a região BR e a chave", async () => {
    const fetch = responde({ status: "OK", results: [{ geometry: { location: { lat: -22.9, lng: -47.06 } } }] });
    await expect(geocodificar("Rua A, 10, Campinas - SP", { chave: "k", fetch })).resolves.toEqual({ lat: -22.9, lng: -47.06 });
    const url = new URL(String((fetch.mock.calls[0] as unknown as [URL])[0]));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ address: "Rua A, 10, Campinas - SP", region: "br", components: "country:BR", key: "k" });
  });

  it("endereço não encontrado = nulo; chave recusada, HTTP ou formato = erro", async () => {
    await expect(geocodificar("x", { chave: "k", fetch: responde({ status: "ZERO_RESULTS", results: [] }) })).resolves.toBeNull();
    await expect(geocodificar("x", { chave: "k", fetch: responde({ status: "REQUEST_DENIED" }) })).rejects.toThrow(/REQUEST_DENIED/);
    await expect(geocodificar("x", { chave: "k", fetch: responde({}, 500) })).rejects.toBeInstanceOf(GeocodificacaoError);
    await expect(geocodificar("x", { chave: "k", fetch: responde({ results: "x" }) })).rejects.toThrow(/fora do formato/);
  });
});
