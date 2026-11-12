import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorFile, readJson, request, runDirectory, writeJson } from './common.mjs';

const run = process.argv[2], directory = runDirectory(run);
const config = await readJson(resolve(directory, 'config.json'));
const actorFiles = await readdir(resolve(directory, 'actors'));
const states = await Promise.all(actorFiles.filter(name => name.endsWith('.state.json')).sort().map(name => readJson(resolve(directory, 'actors', name))));
const sellers = states.filter(state => state.account.role === 'seller');
const buyers = states.filter(state => state.account.role === 'customer');
const assignedBudgets = { buyer01: 1800, buyer02: 1200, buyer03: 3500, buyer04: 1600, buyer05: 2500, buyer06: 1300, buyer07: 1400, buyer08: 2200, buyer09: 1800, buyer10: 1000 };
const budgetChecks = buyers.map(state => {
  const requestedTotalRupees = state.orders.reduce((sum, order) => sum + order.quantity * order.requestedUnitPriceRupees, 0);
  return { actor: state.actor, assignedBudgetRupees: assignedBudgets[state.actor], requestedTotalRupees, withinBudget: requestedTotalRupees <= assignedBudgets[state.actor] };
});
const { listings } = await request(run, 'seller01', '/api/listings');
const orders = [];
for (const seller of sellers) {
  const result = await request(run, seller.actor, `/api/sellers/${seller.account.id}/requests`, 'GET', undefined, seller.token);
  orders.push(...result.requests);
}
const stock = listings.map(listing => {
  const accepted = orders.filter(order => order.listingId === listing.id && ['accepted', 'completed'].includes(order.status));
  const committed = accepted.reduce((sum, order) => sum + order.acceptedQuantity, 0);
  return { id: listing.id, title: listing.title, originalQuantity: listing.quantity, availableQuantity: listing.availableQuantity, committedQuantity: committed, consistent: Math.abs(listing.availableQuantity - (listing.quantity - committed)) < 0.00001 };
});
const events = (await Promise.all(actorFiles.filter(name => name.endsWith('.events.jsonl')).map(async name => (await readFile(resolve(directory, 'actors', name), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))))).flat();
const latencies = events.map(event => event.durationMs).sort((a, b) => a - b);
const searches = states.flatMap(state => state.searches.map(search => ({ actor: state.actor, ...search })));
const failed = events.filter(event => event.status >= 400);
const actors = await Promise.all(states.map(async state => ({ actor: state.actor, role: state.account.role, model: state.model, name: [state.account.firstName, state.account.lastName].join(' '), email: state.email,
  accountId: state.account.id, plan: await readJson(actorFile(run, state.actor, 'plan.json')), listings: state.listings, orders: state.orders.map(({ id, listingId, productName, quantity }) => ({ id, listingId, productName, quantity })), sellerDecisions: state.decisions,
  transportSearches: state.searches.map(({ destination, matchCount, rationale }) => ({ destination, matchCount, rationale })) })));
const report = { ...config, reportedAt: new Date().toISOString(), scope: 'Real API workflows against isolated PostgreSQL; not a visual UI test, booking or real payment.',
  counts: { actors: states.length, sellers: sellers.length, buyers: buyers.length, listings: listings.length, orders: orders.length,
    accepted: orders.filter(order => order.status === 'accepted').length, declined: orders.filter(order => order.status === 'declined').length,
    pending: orders.filter(order => order.status === 'pending').length, transportSearches: searches.length, searchesWithMatches: searches.filter(search => search.matchCount > 0).length,
    searchesWithoutMatches: searches.filter(search => search.matchCount === 0).length, apiRequests: events.length, failedApiRequests: failed.length },
  latencyMs: { median: latencies[Math.floor(latencies.length * 0.5)] ?? 0, p95: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0, max: latencies.at(-1) ?? 0 },
  stockConsistent: stock.every(item => item.consistent), stock, actors, orders, searches, failures: failed, budgetChecks,
  findings: [
    ...(failed.some(event => event.actor === 'seller08' && event.error === 'INVALID_INPUT') ? [{ type: 'agent_input_error', actor: 'seller08', detail: 'The agent chose unsupported unit set for its third listing. API rejected it correctly; the agent retained its original plan, changed the unit to piece and retried without duplicate listings.' }] : []),
    ...(failed.some(event => event.actor === 'seller09' && event.error === 'NOT_FOUND') ? [{ type: 'agent_transcription_error', actor: 'seller09', detail: 'The agent copied 9615 as 9631 in an order UUID, causing two 404s. The original decisions and failed events were retained; correcting the ID from the inbox allowed acceptance.' }] : []),
    ...budgetChecks.filter(item => !item.withinBudget).map(item => ({ type: 'agent_decision_error', actor: item.actor, detail: `Requested Rs${item.requestedTotalRupees} against a synthetic Rs${item.assignedBudgetRupees} budget. The marketplace has no budget-limit feature; no actual payment occurred.` })),
  ],
  cost: { measuredTokens: null, actualChargeUSD: null, reason: 'Built-in Codex Luna subagents were used; this session does not expose per-agent token/billing totals. No separate OpenAI API key was used.' },
  dataRetention: 'All database rows, fixture files, actor plans and ignored local credential files are retained. No cleanup was run.' };
await writeJson(resolve(directory, 'report.json'), report);
const markdown = `# Retained Luna marketplace simulation\n\nRun: ${run}\n\nModel: GPT-6 Luna. Twenty independent subagent identities; maximum three concurrent actors.\n\n${report.scope}\n\n## Results\n\n` + Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`).join('\n') +
  `\n- stockConsistent: ${report.stockConsistent}\n- API latency: median ${report.latencyMs.median} ms; p95 ${report.latencyMs.p95} ms; max ${report.latencyMs.max} ms.\n\n## Retained data\n\n- Database schema: \`${config.schema}\`\n- Marketplace API: ${config.apiUrl}\n- Transport service: ${config.transportUrl}\n- Web interface: ${config.uiUrl}\n- Evidence: report.json plus actors/*.plan.json and actors/*.events.jsonl in this folder.\n- Local test credentials: actors/*.state.json (ignored by Git; do not publish these files).\n\n## Actors\n\n| Actor | Name | Role | Listings | Orders | Transport searches |\n|---|---|---|---:|---:|---:|\n` +
  states.map(state => `| ${state.actor} | ${state.account.firstName} ${state.account.lastName} | ${state.account.role} | ${state.listings.length} | ${state.orders.length} | ${state.searches.length} |`).join('\n') +
  `\n\n## Findings\n\n` + (report.findings.map(item => `- ${item.actor}: ${item.detail}`).join('\n') || '- No findings recorded.') +
  `\n\n## Limits\n\n- Actions were selected by Luna actors and executed through API helpers; browser and mobile UI interactions were not tested.\n- Listing images are tiny placeholder PNGs, not product photography.\n- Transport matches use copied, explicitly synthetic fixtures with future departure dates; no transporter was called and no journey was booked.\n- This is a short staged workflow run with three concurrent agents, not a twenty-concurrent-user load benchmark.\n- Per-agent token counts and actual Codex charges are unavailable here; no dollar total is claimed.\n- ${report.dataRetention}\n`;
await (await import('node:fs/promises')).writeFile(resolve(directory, 'report.md'), markdown);
console.log(JSON.stringify({ ...report.counts, stockConsistent: report.stockConsistent, latencyMs: report.latencyMs, report: resolve(directory, 'report.md') }, null, 2));
