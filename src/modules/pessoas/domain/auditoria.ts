// Trilha das mudanças no cadastro do staff (docs/09 §7.1 e §9.1): o registro_acao é imutável, então guarda só o
// NOME dos campos que mudaram, nunca o valor (sexo, camiseta e coordenadas são dados pessoais).

function normalizar(valor: unknown): unknown {
  if (typeof valor === "string" && valor.trim() !== "" && !Number.isNaN(Number(valor))) return Number(valor);
  return valor ?? null;
}

/** Campos de `depois` (os enviados: `undefined` = não mexeu) com valor diferente de `antes`. */
export function camposAlterados(antes: Record<string, unknown> | null, depois: Record<string, unknown>): string[] {
  return Object.entries(depois)
    .filter(([, valor]) => valor !== undefined)
    .filter(([campo, valor]) => normalizar(antes?.[campo]) !== normalizar(valor))
    .map(([campo]) => campo);
}
