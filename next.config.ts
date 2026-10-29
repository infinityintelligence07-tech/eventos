import type { NextConfig } from "next";

import { cabecalhosDeSeguranca, origensDasServerActions } from "./src/core/config/leitura";

// Lido no build (output standalone): EVENTOS_URL_PUBLICA precisa existir também no ambiente do build.
const origens = origensDasServerActions(process.env.EVENTOS_URL_PUBLICA || undefined);

const nextConfig: NextConfig = {
  output: "standalone",
  // O lint roda separado (npm run lint, CI) com a configuração de fronteiras do projeto.
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
  experimental: origens.length > 0 ? { serverActions: { allowedOrigins: origens } } : {},
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca(process.env.NODE_ENV === "production") }];
  },
};

export default nextConfig;
