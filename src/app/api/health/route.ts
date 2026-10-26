export const dynamic = "force-dynamic";

// Liveness: o processo responde. Com ?db=1, readiness: o banco também responde.
// O banco é importado só quando pedido, para o build não exigir DATABASE_URL.
export async function GET(request: Request): Promise<Response> {
  const checarBanco = new URL(request.url).searchParams.get("db") === "1";

  if (!checarBanco) {
    return Response.json({ status: "ok" });
  }

  const { verificarBanco } = await import("@/core/db/health");
  const banco = await verificarBanco();
  return Response.json({ status: banco ? "ok" : "erro", banco }, { status: banco ? 200 : 503 });
}
