import pg from "pg";
import { env } from "./env.js";
import { getSslConfig } from "../utils/dbAdmin.js";

const { Pool } = pg;

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is missing. Create backend/.env from backend/.env.example before starting the server.");
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
  ssl: getSslConfig(env.databaseUrl, env.databaseSslMode)
});

pool.on('error', error => console.error('Idle database connection failed:', error.code || error.name));

export async function verifyDatabaseConnection() {
  await pool.query("select 1");
}
