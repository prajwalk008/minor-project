import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });

let pool;

export function usesFileAuthStore() {
  return Boolean(process.env.AUTH_DATA_FILE);
}

export function databasePool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when AUTH_DATA_FILE is not set');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function closeDatabasePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
