import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { config } from "@/core/config";

import * as core from "./schema/core";
import * as eventos from "./schema/eventos";

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  application_name: "eventos-web",
});

export const db = drizzle({
  client: pool,
  schema: { ...core, ...eventos },
});
