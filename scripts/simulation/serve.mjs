import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson, runDirectory } from './common.mjs';

const run = process.argv[2];
const config = await readJson(resolve(runDirectory(run), 'config.json'));
if (config.schema !== `sim_${run}`) throw new Error('Unexpected simulation schema');
process.env.PGOPTIONS = `-c search_path=${config.schema}`;
process.env.TRANSPORT_API_BASE_URL = config.transportUrl;
delete process.env.AUTH_DATA_FILE;
// Bring a retained run up to the current schema without touching its records.
await import('../../server/migrate.js');
const { createServer } = await import('../../server/index.js');
const { server: transport } = await import(pathToFileURL(resolve(runDirectory(run), 'transport/index.js')));
const api = createServer();
await new Promise(resolve => transport.listen(4101, '127.0.0.1', resolve));
await new Promise(resolve => api.listen(4001, '127.0.0.1', resolve));
console.log(`Retained Luna simulation ${run}: marketplace 4001, transport 4101, schema ${config.schema}`);
// Stopping this process stops services only. No records, schemas, or fixture files are deleted.
