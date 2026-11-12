import { mkdir, readFile, readdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databasePool, closeDatabasePool } from '../../server/db.js';
import { root, runDirectory, writeJson } from './common.mjs';

const run = process.argv[2];
const directory = runDirectory(run);
const schema = 'sim_' + run;
await mkdir(resolve(directory, 'actors'), { recursive: true });
const db = databasePool();
const client = await db.connect();
try {
  await client.query('BEGIN');
  // A new schema is mandatory: never overwrite an existing simulation or application data.
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  await client.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for (const name of (await readdir(resolve(root, 'server/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    await client.query(await readFile(resolve(root, 'server/migrations', name), 'utf8'));
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
  }
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await closeDatabasePool(); }

const transportSource = resolve(root, '../transport_project/transport-service');
await mkdir(resolve(directory, 'transport/data'), { recursive: true });
await copyFile(resolve(transportSource, 'index.js'), resolve(directory, 'transport/index.js'));
const trips = JSON.parse(await readFile(resolve(transportSource, 'data/trips.json'), 'utf8'));
for (const [index, trip] of trips.entries()) {
  trip.departAt = new Date(Date.now() + (48 + index * 2) * 3600000).toISOString();
  trip.transporterName = `Simulation transporter ${index + 1}`;
  trip.transporterPhone = '+910000000000';
  trip.explanation = 'Retained AI simulation fixture; not a real journey or callable transporter.';
}
await writeJson(resolve(directory, 'transport/data/trips.json'), trips);
await writeJson(resolve(directory, 'config.json'), { runId: run, schema, model: 'gpt-6-luna', execution: '20 separate Codex Luna subagents, API interaction', apiUrl: 'http://127.0.0.1:4001', transportUrl: 'http://127.0.0.1:4101', uiUrl: 'http://localhost:8082', createdAt: new Date().toISOString(), retained: true, placeholderProductImages: true });
console.log(JSON.stringify({ run, schema, retained: true, tripFixtures: trips.length }));
