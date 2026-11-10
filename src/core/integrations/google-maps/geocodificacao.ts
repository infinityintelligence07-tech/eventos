import { z } from "zod";

// Endereço -> coordenadas (Google Geocoding API), no servidor: a chave nunca vai ao navegador e o endereço não é
// gravado nem registrado no log (docs/10, minimização). Só serve para distância, caronas e custo de deslocamento.

const respostaSchema = z.object({
  status: z.string(),
  results: z.array(z.object({ geometry: z.object({ location: z.object({ lat: z.number(), lng: z.number() }) }) })).default([]),
});

export class GeocodificacaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodificacaoError";
  }
}

export type Coordenadas = { lat: number; lng: number };

/** Nulo = o Google não achou o endereço. Erro = chave inválida, cota, rede ou resposta inesperada. */
export async function geocodificar(endereco: string, opcoes: { chave: string; fetch?: typeof fetch; timeoutMs?: number }): Promise<Coordenadas | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", endereco);
  url.searchParams.set("region", "br");
  url.searchParams.set("components", "country:BR");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", opcoes.chave);

  let resposta: Response;
  try {
    resposta = await (opcoes.fetch ?? fetch)(url, { signal: AbortSignal.timeout(opcoes.timeoutMs ?? 10_000) });
  } catch (cause: unknown) {
    throw new GeocodificacaoError(`Google Maps indisponível: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (!resposta.ok) throw new GeocodificacaoError(`Google Maps respondeu ${resposta.status}`);
  const leitura = respostaSchema.safeParse(await resposta.json().catch(() => null));
  if (!leitura.success) throw new GeocodificacaoError("Resposta do Google Maps fora do formato esperado");

  switch (leitura.data.status) {
    case "OK": {
      const local = leitura.data.results[0]?.geometry.location;
      return local ? { lat: local.lat, lng: local.lng } : null;
    }
    case "ZERO_RESULTS":
      return null;
    default:
      // REQUEST_DENIED (chave), OVER_QUERY_LIMIT, INVALID_REQUEST... O status não traz dado pessoal.
      throw new GeocodificacaoError(`Google Maps recusou: ${leitura.data.status}`);
  }
}
