import { access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { actorFile, fixturePng, readJson, request, writeJson } from './common.mjs';

const [run, actor, action] = process.argv.slice(2);
const statePath = actorFile(run, actor);
const planPath = actorFile(run, actor, 'plan.json');
const api = (path, method, body, token) => request(run, actor, path, method, body, token);
const save = state => writeJson(statePath, state);
async function session() {
  try { await access(statePath); return await readJson(statePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const plan = await readJson(planPath);
  const [firstName, ...last] = plan.name.trim().split(/\s+/);
  const role = actor.startsWith('seller') ? 'seller' : 'customer';
  const email = `${run}.${actor}@example.invalid`;
  const password = randomBytes(18).toString('hex');
  const phone = '+91900000' + actor.slice(-2).padStart(4, '0');
  const registered = await api('/api/auth/register', 'POST', { firstName, lastName: last.join(' ') || 'Simulation', role, email, password, ...(role === 'seller' ? { phone } : {}) });
  // Save before login so retrying the helper cannot duplicate a successfully created account.
  const state = { actor, model: 'gpt-6-luna', account: registered.account, token: registered.token, email, password, phone, listings: [], orders: [], searches: [], decisions: [] };
  await save(state);
  const login = await api('/api/auth/login', 'POST', { role, identifier: email, password });
  state.token = login.token;
  await save(state);
  return state;
}
if (action === 'catalog') {
  const { listings } = await api('/api/listings');
  for (const { id, sellerId, title, category, unit, unitPriceRupees, availableQuantity } of listings) console.log(JSON.stringify({ id, sellerId, title, category, unit, unitPriceRupees, availableQuantity }));
} else if (action === 'publish') {
  if (!actor.startsWith('seller')) throw new Error('Seller role required');
  const state = await session(), plan = await readJson(planPath);
  if (plan.products.length !== 3) throw new Error('Choose exactly three products');
  for (const [index, product] of plan.products.entries()) {
    if (state.listings.some(item => item.index === index)) continue;
    const photo = await api('/api/listing-photos', 'POST', { clientPhotoId: `${actor}-photo-${index}`, mimeType: 'image/png', base64: fixturePng }, state.token);
    const listing = await api('/api/listings', 'POST', { ...product, title: `[SIM] ${product.title}`, description: product.description || '', clientDraftId: `${actor}-product-${index}`, photoId: photo.photoId, village: 'Kondagaon', pickupLocation: { lat: 19.5939, lng: 81.6689 } }, state.token);
    state.listings.push({ index, id: listing.id, title: listing.title }); await save(state);
  }
  console.log(JSON.stringify({ actor, accountId: state.account.id, listings: state.listings }));
} else if (action === 'buy') {
  if (!actor.startsWith('buyer')) throw new Error('Buyer role required');
  const state = await session(), plan = await readJson(planPath);
  if (plan.orders.length !== 2) throw new Error('Choose exactly two orders');
  for (const [index, choice] of plan.orders.entries()) {
    if (state.orders.some(item => item.index === index)) continue;
    const listing = await api(`/api/listings/${choice.listingId}`);
    const order = await api('/api/requests', 'POST', { listingId: listing.id, buyerName: plan.name, buyerPhone: state.phone, quantity: choice.quantity }, state.token);
    state.orders.push({ index, ...order }); await save(state);
    const destination = { Raipur: { lat: 21.2514, lng: 81.6296 }, Jagdalpur: { lat: 19.0741, lng: 82.008 } }[choice.destination];
    if (!destination) throw new Error('Destination must be Raipur or Jagdalpur');
    const matches = await api('/api/transport/matches', 'POST', { origin: listing.pickupLocation, destination, pickupRadiusKm: choice.pickupRadiusKm ?? 10, dropRadiusKm: choice.dropRadiusKm ?? 10, loadKg: listing.estimatedWeightKgPerUnit * choice.quantity, packageCount: 1, packageLengthCm: listing.packageLengthCmPerUnit, packageWidthCm: listing.packageWidthCmPerUnit, packageHeightCm: listing.packageHeightCmPerUnit, earliestDepartAt: new Date().toISOString() });
    state.searches.push({ orderId: order.id, destination: choice.destination, matchCount: matches.matches.length, matches: matches.matches, rationale: choice.rationale }); await save(state);
  }
  console.log(JSON.stringify({ actor, accountId: state.account.id, orders: state.orders.map(({ id, productName, quantity, status }) => ({ id, productName, quantity, status })), transport: state.searches.map(({ destination, matchCount }) => ({ destination, matchCount })) }));
} else if (action === 'inbox') {
  const state = await session();
  const result = await api(`/api/sellers/${state.account.id}/requests`, 'GET', undefined, state.token);
  console.log(JSON.stringify(result, null, 2));
} else if (action === 'decide') {
  const state = await session();
  const plan = await readJson(actorFile(run, actor, 'decisions.json'));
  for (const decision of plan.decisions) {
    const current = await api(`/api/requests/${decision.requestId}`, 'GET', undefined, state.token);
    if (current.status !== 'pending') continue;
    if (!['accept', 'decline'].includes(decision.action)) throw new Error('Seller may accept or decline');
    const changed = await api(`/api/requests/${current.id}/status`, 'PATCH', { action: decision.action, exactQuantity: current.quantity, unitPriceRupees: current.requestedUnitPriceRupees, totalPriceRupees: current.quantity * current.requestedUnitPriceRupees }, state.token);
    state.decisions.push({ id: changed.id, action: decision.action, rationale: decision.rationale }); await save(state);
  }
  console.log(JSON.stringify({ actor, decisions: state.decisions }));
} else if (action === 'orders') {
  const state = await session();
  console.log(JSON.stringify(await api('/api/buyers/me/requests', 'GET', undefined, state.token), null, 2));
} else throw new Error('Actions: catalog, publish, buy, inbox, decide, orders');
