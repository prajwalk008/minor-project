import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export function runDirectory(run) {
  if (!/^luna20_\d{8}_\d{6}$/.test(run)) throw new Error('Invalid simulation run ID');
  return resolve(root, 'server/data', run);
}
export function actorFile(run, actor, suffix = 'state.json') {
  if (!/^(seller|buyer)(0[1-9]|10)$/.test(actor)) throw new Error('Unknown simulation actor');
  return resolve(runDirectory(run), 'actors', `${actor}.${suffix}`);
}
export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
export async function writeJson(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n'); }
export const fixturePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=';
export async function request(run, actor, path, method = 'GET', input, token) {
  const config = await readJson(resolve(runDirectory(run), 'config.json'));
  const start = performance.now();
  const response = await fetch(config.apiUrl + path, { method,
    headers: { ...(input ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: input ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  await mkdir(resolve(runDirectory(run), 'actors'), { recursive: true });
  await appendFile(actorFile(run, actor, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), actor, method, path, status: response.status, durationMs: Math.round(performance.now() - start), ...(data.error ? { error: data.error.code } : {}) }) + '\n');
  if (!response.ok) { const error = new Error(`${method} ${path}: ${response.status} ${data.error?.code}`); error.code = data.error?.code; throw error; }
  return data;
}
