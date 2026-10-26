export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "falha desconhecida";
}

/** Quedas típicas do pooler Supabase / rede — não devem derrubar o processo. */
export function isTransientDbError(message: string): boolean {
  const haystack = message.toLowerCase();
  return (
    haystack.includes("connection terminated") ||
    haystack.includes("econnreset") ||
    haystack.includes("enotfound") ||
    haystack.includes("etimedout") ||
    haystack.includes("timeout exceeded") ||
    haystack.includes("timeout") ||
    haystack.includes("server closed the connection") ||
    haystack.includes("connection refused") ||
    haystack.includes("cannot acquire")
  );
}
