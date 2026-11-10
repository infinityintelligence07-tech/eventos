import { z } from "zod";

// Endereço -> coordenadas sem custo e sem chave (docs/10): Nominatim (OpenStreetMap) para o endereço e BrasilAPI para
// o ponto do CEP. No servidor; o endereço não é gravado nem vai para o log (minimização). Serve só para distância,
// caronas e custo de deslocamento.

export class LocalizacaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalizacaoError";
  }
}

export type Coordenadas = { lat: number; lng: number };

export type OpcoesDeLocalizacao = { fetch?: typeof fetch; timeoutMs?: number; agora?: () => number; esperar?: (ms: number) => Promise<void> };

// Política do Nominatim: identificar o app e no máximo 1 pedido por segundo, sem uso em massa.
const IDENTIFICACAO = "EventosIAM/1.0 (+https://eventos.iamcontrol.com.br)";
const INTERVALO_DO_NOMINATIM_MS = 1100;
let fila: Promise<void> = Promise.resolve();
let ultimoPedido = 0;

/** Um pedido ao Nominatim por vez, com 1,1 s de intervalo, neste processo. */
function naVezDoNominatim(opcoes: OpcoesDeLocalizacao): Promise<void> {
  const agora = opcoes.agora ?? Date.now;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)));
  const vez = fila.then(async () => {
    const falta = ultimoPedido + INTERVALO_DO_NOMINATIM_MS - agora();
    if (falta > 0) await esperar(falta);
    ultimoPedido = agora();
  });
  fila = vez.catch(() => undefined);
  return vez;
}

async function lerJson(url: URL, opcoes: OpcoesDeLocalizacao, origem: string): Promise<{ status: number; corpo: unknown }> {
  let resposta: Response;
  try {
    resposta = await (opcoes.fetch ?? fetch)(url, {
      headers: { "user-agent": IDENTIFICACAO, accept: "application/json", "accept-language": "pt-BR" },
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? 10_000),
    });
  } catch (cause: unknown) {
    throw new LocalizacaoError(`${origem} indisponível: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
}

const numero = z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().finite());
const nominatimSchema = z.array(z.object({ lat: numero, lon: numero }));

export type EnderecoParaMapa = { rua: string; numero: string; cidade: string; uf: string; cep: string | null };

/** Nominatim, busca estruturada no Brasil. Nulo = não achou. */
export async function localizarEndereco(endereco: EnderecoParaMapa, opcoes: OpcoesDeLocalizacao = {}): Promise<Coordenadas | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("street", `${endereco.numero} ${endereco.rua}`);
  url.searchParams.set("city", endereco.cidade);
  url.searchParams.set("state", endereco.uf);
  if (endereco.cep) url.searchParams.set("postalcode", `${endereco.cep.slice(0, 5)}-${endereco.cep.slice(5)}`);

  await naVezDoNominatim(opcoes);
  const { status, corpo } = await lerJson(url, opcoes, "Nominatim");
  if (status !== 200) throw new LocalizacaoError(`Nominatim respondeu ${status}`);
  const leitura = nominatimSchema.safeParse(corpo);
  if (!leitura.success) throw new LocalizacaoError("Resposta do Nominatim fora do formato esperado");
  const primeiro = leitura.data[0];
  return primeiro ? { lat: primeiro.lat, lng: primeiro.lon } : null;
}

// CEP sem coordenada vem com "" ou sem o campo.
const talvezNumero = z.preprocess((valor) => (valor === "" || valor === null ? undefined : valor), numero.optional());

const brasilApiSchema = z.object({
  location: z
    .object({ coordinates: z.object({ latitude: talvezNumero, longitude: talvezNumero }).partial() })
    .partial()
    .optional(),
});

/** BrasilAPI (CEP v2): o ponto do CEP. Nulo = CEP sem coordenada ou inexistente. */
export async function localizarCep(cep: string, opcoes: OpcoesDeLocalizacao = {}): Promise<Coordenadas | null> {
  const { status, corpo } = await lerJson(new URL(`https://brasilapi.com.br/api/cep/v2/${encodeURIComponent(cep)}`), opcoes, "BrasilAPI");
  if (status === 404 || status === 400) return null;
  if (status !== 200) throw new LocalizacaoError(`BrasilAPI respondeu ${status}`);
  const leitura = brasilApiSchema.safeParse(corpo);
  if (!leitura.success) throw new LocalizacaoError("Resposta da BrasilAPI fora do formato esperado");
  const ponto = leitura.data.location?.coordinates;
  return ponto?.latitude !== undefined && ponto.longitude !== undefined ? { lat: ponto.latitude, lng: ponto.longitude } : null;
}
