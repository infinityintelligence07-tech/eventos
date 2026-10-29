import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Os testes de integração criam e apagam bancos no mesmo Postgres; sob concorrência o DROP DATABASE demora.
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/iam",
      LOG_LEVEL: "silent",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
