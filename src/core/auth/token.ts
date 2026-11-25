// Lê só o cabeçalho do token de acesso (JWT) para saber COMO ele pode ser conferido. Não confere nada e não importa
// nada: o middleware (runtime edge) usa este arquivo direto.

/**
 * O token foi assinado com chave assimétrica (ES256, RS256…) e diz com qual (`kid`)? É a condição em que o getClaims()
 * do @supabase/auth-js confere a assinatura aqui mesmo, com a chave pública do projeto, sem ir ao Supabase Auth. Com
 * segredo simétrico (HS256) ou sem `kid`, o getClaims() faz um getUser() por dentro: uma ida pela rede.
 * Qualquer coisa ilegível → falso (quem chama não tenta conferir sem rede).
 */
export function tokenDeChaveAssimetrica(token: string): boolean {
  try {
    const partes = token.split(".");
    if (partes.length !== 3 || !partes[0]) return false;
    const cabecalho: unknown = JSON.parse(atob(partes[0].replace(/-/g, "+").replace(/_/g, "/")));
    if (!cabecalho || typeof cabecalho !== "object") return false;
    const { alg, kid } = cabecalho as { alg?: unknown; kid?: unknown };
    if (typeof alg !== "string" || alg === "" || alg.toLowerCase() === "none" || alg.startsWith("HS")) return false;
    return typeof kid === "string" && kid !== "";
  } catch {
    return false;
  }
}
