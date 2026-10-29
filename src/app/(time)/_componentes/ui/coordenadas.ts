// O Google Maps copia "-26.94209, -48.63893" (ponto decimal); quem digita à mão pode usar vírgula ("-26,94; -48,63").

export type Coordenadas = { lat: number; lng: number };

const NUMERO = String.raw`(-?\d{1,3}(?:[.,]\d+)?)`;
const PAR = new RegExp(String.raw`^\s*${NUMERO}\s*(?:,\s+|;\s*|\s+|,(?=-))\s*${NUMERO}\s*$`);
const PAR_COM_PONTO = new RegExp(String.raw`^\s*${NUMERO}\s*,\s*${NUMERO}\s*$`);

/** Lê "latitude, longitude" colado do mapa. Devolve null se não forem dois números válidos. */
export function lerCoordenadas(texto: string): Coordenadas | null {
  const encontrado = texto.match(PAR) ?? (texto.includes(".") ? texto.match(PAR_COM_PONTO) : null);
  if (!encontrado) return null;
  const lat = Number(encontrado[1]!.replace(",", "."));
  const lng = Number(encontrado[2]!.replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
