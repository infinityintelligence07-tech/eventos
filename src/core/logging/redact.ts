import { serializarErro } from "./erro";

const SENSITIVE_FIELDS = new Set([
  "accessToken",
  "anonKey",
  "authorization",
  "chavePix",
  "cookie",
  "cpf",
  "email",
  "endereco",
  "password",
  "refreshToken",
  "rg",
  "salario",
  "serviceRoleKey",
  "telefone",
  "token",
]);

function isSensitiveField(field: string): boolean {
  const normalizedField = field.replace(/[-_]/g, "").toLowerCase();

  return [...SENSITIVE_FIELDS].some(
    (sensitiveField) =>
      sensitiveField.replace(/[-_]/g, "").toLowerCase() === normalizedField,
  );
}

export function redactSensitive(value: unknown): unknown {
  // Error em qualquer nível (ex.: { err }) passa pela lista fixa de campos: params e detail ficam de fora.
  if (value instanceof Error) {
    return serializarErro(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      isSensitiveField(key) ? [] : [[key, redactSensitive(entry)]],
    ),
  );
}
