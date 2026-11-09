import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { closeDatabasePool, databasePool } from './db.js';

const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const db = databasePool();

try {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const files = (await readdir(migrationDirectory)).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const alreadyApplied = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (alreadyApplied.rowCount) {
      console.log('Already applied: ' + file);
      continue;
    }
    const sql = await readFile(join(migrationDirectory, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('Applied: ' + file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await closeDatabasePool();
}
