import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databasePool, closeDatabasePool } from '../../server/db.js';
import { readJson, runDirectory, writeJson } from './common.mjs';

// Copy retained sample records into the main application. Never delete or overwrite rows.
const run = process.argv[2];
const apply = process.argv.includes('--apply');
const directory = runDirectory(run);
const config = await readJson(resolve(directory, 'config.json'));
if (config.schema !== `sim_${run}`) throw new Error('Unexpected source schema');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const source = quote(config.schema);
const tables = ['users', 'listing_photos', 'listings', 'requests', 'product_reviews', 'product_review_images'];
const db = databasePool();
const client = await db.connect();
let committed = false;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  const report = { runId: run, sourceSchema: config.schema, targetSchema: 'public', applied: apply,
    at: new Date().toISOString(), sourcePreserved: true, existingRowsOverwritten: false, sessionsCopied: false, tables: {} };
  const columnSets = new Map();
  // Check every table before copying anything. Conflicting IDs or schema drift abort the whole copy.
  for (const table of tables) {
    const columns = async schema => (await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name`, [schema, table])).rows.map(row => row.column_name);
    const [sourceColumns, targetColumns] = await Promise.all([columns(config.schema), columns('public')]);
    if (!sourceColumns.length || JSON.stringify(sourceColumns) !== JSON.stringify(targetColumns)) throw new Error(`Schema mismatch for ${table}; run migrations before promotion`);
    columnSets.set(table, sourceColumns.map(quote).join(', '));
    const counts = await client.query(`SELECT
      (SELECT COUNT(*)::int FROM ${source}.${quote(table)}) AS source,
      (SELECT COUNT(*)::int FROM public.${quote(table)}) AS "targetBefore",
      (SELECT COUNT(*)::int FROM ${source}.${quote(table)} s JOIN public.${quote(table)} d USING(id)) AS existing,
      (SELECT COUNT(*)::int FROM ${source}.${quote(table)} s JOIN public.${quote(table)} d USING(id)
        WHERE to_jsonb(s) IS DISTINCT FROM to_jsonb(d)) AS conflicting`);
    report.tables[table] = counts.rows[0];
    if (counts.rows[0].conflicting) throw new Error(`Conflicting existing ${table} IDs; refusing to overwrite main data`);
  }
  if (!report.tables.users.source || !report.tables.listings.source) throw new Error('Simulation has no users or listings');
  if (apply) {
    for (const table of tables) {
      const columns = columnSets.get(table);
      const result = await client.query(`INSERT INTO public.${quote(table)} (${columns})
        SELECT ${columns} FROM ${source}.${quote(table)} ON CONFLICT (id) DO NOTHING`);
      report.tables[table].inserted = result.rowCount;
      const verified = await client.query(`SELECT COUNT(*)::int AS count FROM ${source}.${quote(table)} s
        JOIN public.${quote(table)} d USING(id) WHERE to_jsonb(s) = to_jsonb(d)`);
      if (verified.rows[0].count !== report.tables[table].source) throw new Error(`Copy verification failed for ${table}`);
    }
    await client.query('COMMIT');
    committed = true;
    await writeJson(resolve(directory, 'promotion.json'), report);
    await appendFile(resolve(directory, 'promotion-history.jsonl'), JSON.stringify(report) + '\n');
  } else await client.query('ROLLBACK');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (!committed) await client.query('ROLLBACK');
  console.error(JSON.stringify({ error: error.message, code: error.code || null, rolledBack: !committed, databaseCommitted: committed }));
  process.exitCode = 1;
} finally { client.release(); await closeDatabasePool(); }
