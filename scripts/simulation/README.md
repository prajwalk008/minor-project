# AI-controlled marketplace simulations

These helpers expose a small API tool surface to independent AI actors. They do not choose products, purchasing preferences or seller decisions. The retained plans record those choices. Use one GPT-6 Luna subagent per identity, at most three concurrently in this session.

## Create an isolated, retained run

From the repository root, choose a fresh ID matching `luna20_YYYYMMDD_HHMMSS`:

```powershell
node scripts/simulation/setup.mjs luna20_20261112_234718
node scripts/simulation/serve.mjs luna20_20261112_234718
```

Setup reads the configured server database connection, creates a new PostgreSQL schema and applies all migrations there. It copies the teammate's transport service from `../transport_project/transport-service` and gives copied demo trips future dates. The original service, trip data and public application tables are unchanged. Existing run schemas are never overwritten. The simulation server binds only loopback: API 4001, transport 4101.

For the separate UI, run in `frontend`:

```powershell
$env:EXPO_PUBLIC_API_URL='http://localhost:4001'
$env:EXPO_OFFLINE='1'
npm run web -- --port 8082
```

## Actor actions

Each seller writes `server/data/<run>/actors/seller01.plan.json` containing a synthetic `name`, a `rationale`, and three full `products` using the existing listing input contract. `publish` registers and logs in, uploads placeholder photos, then creates those listings.

```powershell
node scripts/simulation/actor.mjs <run> seller01 publish
node scripts/simulation/actor.mjs <run> buyer01 catalog
```

After inspecting the real catalogue, each buyer writes `buyer01.plan.json`: `{ "name": "Synthetic Name", "rationale": "purchase intent", "orders": [{ "listingId": "...", "quantity": 2, "destination": "Raipur", "rationale": "why this purchase and route" }, ...] }`. Choose exactly two orders. Destinations may be Raipur or Jagdalpur; optional pickup/drop radius fields are kilometers. `buy` submits the requests and searches the independent transport service through the marketplace proxy.

```powershell
node scripts/simulation/actor.mjs <run> buyer01 buy
node scripts/simulation/actor.mjs <run> seller01 inbox
```

The same seller agent reads its inbox and saves `seller01.decisions.json`: `{ "decisions": [{ "requestId": "...", "action": "accept", "rationale": "..." }] }`. Supported decisions are accept/decline; acceptance keeps the buyer's original price and quantity. The server retains responsibility for authorization and stock.

```powershell
node scripts/simulation/actor.mjs <run> seller01 decide
node scripts/simulation/actor.mjs <run> buyer01 orders
node scripts/simulation/report.mjs <run>
```

All requests and their status/latency are logged per actor. **No cleanup is performed.** Database records, plans, fixtures, reports and ignored local test credentials remain under the run ID. Never commit or publish `*.state.json`: they contain synthetic-account passwords and bearer tokens. Reports omit passwords/tokens. There is no external LLM API call in these helpers; Luna runs through the session's subagent tool, so API token estimates are not measured charges for this run. This tests API workflows, not visual UI behavior or twenty simultaneous sessions.

## Copy sample data into the main marketplace

Use this only when the sample records are wanted in the main application's `public` schema:

```powershell
node scripts/simulation/promote.mjs luna20_20261112_234718
node scripts/simulation/promote.mjs luna20_20261112_234718 --apply
```

The first command previews counts and checks for conflicts without writing database records. `--apply` copies users (including existing password hashes), listing photos, products, order requests, reviews and review images in one transaction, preserving IDs and stock. It leaves the source schema and existing main records intact. Identical records are skipped on repeats; conflicting IDs or email/other unique constraints abort the copy rather than overwriting records. Application session tokens are not copied: sign in again to use a sample account in the main UI with its retained test credentials. An audit is retained in the run's `promotion.json` and `promotion-history.jsonl`. The main marketplace uses API 4000 and web port 8081; the isolated preview stays on 4001/8082. Transport fixtures are not part of this database copy.
