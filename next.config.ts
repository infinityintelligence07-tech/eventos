import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // O lint roda separado (npm run lint, CI) com a configuração de fronteiras do projeto.
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
};

export default nextConfig;
