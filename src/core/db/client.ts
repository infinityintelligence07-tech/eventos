import { config } from "@/core/config";

import { criarDb } from "./database";

export type { Db } from "./database";

export const { db, pool } = criarDb(config.DATABASE_URL);
