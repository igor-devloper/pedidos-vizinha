import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() || "";

export const db = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : null;
