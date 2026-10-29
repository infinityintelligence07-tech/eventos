// Distância em linha reta (haversine) até existir rota pelo mapa (rota_cache). Serve para ordenar sugestões.

export type Coordenada = { lat: number; lng: number };

const RAIO_DA_TERRA_KM = 6371;

const radianos = (graus: number): number => (graus * Math.PI) / 180;

/** Nulo quando falta coordenada de um dos lados. Uma casa decimal. */
export function distanciaKm(de: Coordenada | null, ate: Coordenada | null): number | null {
  if (!de || !ate) return null;
  const dLat = radianos(ate.lat - de.lat);
  const dLng = radianos(ate.lng - de.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radianos(de.lat)) * Math.cos(radianos(ate.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * RAIO_DA_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 10) / 10;
}
