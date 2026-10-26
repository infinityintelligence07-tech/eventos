import { PgBoss } from "pg-boss";

import { config } from "@/core/config";

export function createJobQueue(): PgBoss {
  return new PgBoss({
    connectionString: config.WORKER_DATABASE_URL ?? config.DATABASE_URL,
    // Fila própria do Eventos; a do GH fica em pgboss_gh (ADR 0001).
    schema: "pgboss_eventos",
    createSchema: true,
    migrate: true,
    supervise: true,
    application_name: "eventos-worker",
    // Pooler do Supabase derruba conexões ociosas; pool pequeno + timeout.
    max: 3,
    connectionTimeoutMillis: 15_000,
  });
}
