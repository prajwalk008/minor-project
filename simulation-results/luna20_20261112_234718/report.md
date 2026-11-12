# Retained Luna marketplace simulation

Run: luna20_20261112_234718

Model: GPT-6 Luna. Twenty independent subagent identities; maximum three concurrent actors.

Real API workflows against isolated PostgreSQL; not a visual UI test, booking or real payment.

## Results

- actors: 20
- sellers: 10
- buyers: 10
- listings: 30
- orders: 20
- accepted: 20
- declined: 0
- pending: 0
- transportSearches: 20
- searchesWithMatches: 10
- searchesWithoutMatches: 10
- apiRequests: 241
- failedApiRequests: 3
- stockConsistent: true
- API latency: median 134 ms; p95 325 ms; max 494 ms.

## Retained data

- Database schema: `sim_luna20_20261112_234718`
- Marketplace API: http://127.0.0.1:4001
- Transport service: http://127.0.0.1:4101
- Web interface: http://localhost:8082
- Evidence: report.json plus actors/*.plan.json and actors/*.events.jsonl in this folder.
- Local test credentials: actors/*.state.json (ignored by Git; do not publish these files).

## Actors

| Actor | Name | Role | Listings | Orders | Transport searches |
|---|---|---|---:|---:|---:|
| buyer01 | Ananya Verma | customer | 0 | 2 | 2 |
| buyer02 | Asha Verma | customer | 0 | 2 | 2 |
| buyer03 | Aarav Deshmukh | customer | 0 | 2 | 2 |
| buyer04 | Maya Verma | customer | 0 | 2 | 2 |
| buyer05 | Mira Patel | customer | 0 | 2 | 2 |
| buyer06 | Asha Verma | customer | 0 | 2 | 2 |
| buyer07 | Synthetic First Last | customer | 0 | 2 | 2 |
| buyer08 | Maya Verma | customer | 0 | 2 | 2 |
| buyer09 | Maya Sahu | customer | 0 | 2 | 2 |
| buyer10 | Mina Sahu | customer | 0 | 2 | 2 |
| seller01 | Mira Netam | seller | 3 | 0 | 0 |
| seller02 | Sukhram Markam | seller | 3 | 0 | 0 |
| seller03 | Madhav Netam | seller | 3 | 0 | 0 |
| seller04 | Mina Markam | seller | 3 | 0 | 0 |
| seller05 | Mina Netam | seller | 3 | 0 | 0 |
| seller06 | Ramesh Netam | seller | 3 | 0 | 0 |
| seller07 | Ravi Markam | seller | 3 | 0 | 0 |
| seller08 | Kavita Sahu | seller | 3 | 0 | 0 |
| seller09 | Meera Netam | seller | 3 | 0 | 0 |
| seller10 | Meera Netam | seller | 3 | 0 | 0 |

## Findings

- seller08: The agent chose unsupported unit set for its third listing. API rejected it correctly; the agent retained its original plan, changed the unit to piece and retried without duplicate listings.
- seller09: The agent copied 9615 as 9631 in an order UUID, causing two 404s. The original decisions and failed events were retained; correcting the ID from the inbox allowed acceptance.
- buyer03: Requested Rs3550 against a synthetic Rs3500 budget. The marketplace has no budget-limit feature; no actual payment occurred.

## Limits

- Actions were selected by Luna actors and executed through API helpers; browser and mobile UI interactions were not tested.
- Listing images are tiny placeholder PNGs, not product photography.
- Transport matches use copied, explicitly synthetic fixtures with future departure dates; no transporter was called and no journey was booked.
- This is a short staged workflow run with three concurrent agents, not a twenty-concurrent-user load benchmark.
- Per-agent token counts and actual Codex charges are unavailable here; no dollar total is claimed.
- All database rows, fixture files, actor plans and ignored local credential files are retained. No cleanup was run.
