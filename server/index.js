import http from 'node:http';
import { randomUUID, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { databasePool, usesFileAuthStore } from './db.js';

const PORT = Number(process.env.PORT || 4000);
const TRANSPORT_API_BASE_URL = process.env.TRANSPORT_API_BASE_URL;
const scrypt = promisify(scryptCallback);
const seller = { id: 'demo-seller', name: 'Demo Kondagaon Seller', phone: '+910000000000', village: 'Kondagaon', district: 'Kondagaon' };
const listings = new Map();
const photos = new Map();
const requests = new Map();
const draftIds = new Map();
const photoIds = new Map();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INDIA_PHONE = /^(?:\+91|91)?[6-9]\d{9}$/;

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function authDataFile() { return process.env.AUTH_DATA_FILE; }
function normalizePhone(value) {
  const compact = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!INDIA_PHONE.test(compact)) return null;
  return compact.startsWith('+91') ? compact : '+91' + compact.replace(/^91/, '');
}
async function fileUsers() {
  try {
    const data = JSON.parse(await readFile(authDataFile(), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function saveUsers(items) {
  const target = authDataFile();
  await mkdir(dirname(target), { recursive: true });
  const temp = target + '.tmp';
  await writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
  await rename(temp, target);
}
async function findAccount(email, role) {
  if (usesFileAuthStore()) {
    return (await fileUsers()).find(account => account.email === email && (!role || account.role === role));
  }
  const result = await databasePool().query(
    'SELECT id::text AS id, role, email, phone, first_name AS "firstName", last_name AS "lastName", password_salt AS salt, password_hash AS hash, created_at AS "createdAt" FROM users WHERE email = $1 AND ($2::text IS NULL OR role = $2)',
    [email, role || null],
  );
  return result.rows[0];
}
async function saveAccount(account) {
  if (usesFileAuthStore()) {
    const existing = await fileUsers();
    existing.push(account);
    await saveUsers(existing);
    return;
  }
  await databasePool().query(
    'INSERT INTO users (id, role, email, phone, password_salt, password_hash, created_at, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [account.id, account.role, account.email, account.phone, account.salt, account.hash, account.createdAt, account.firstName, account.lastName],
  );
}
async function findLoginAccount(identifier, role) {
  const email = normalizeEmail(identifier);
  if (EMAIL.test(email)) return findAccount(email, role);
  const phone = role === 'seller' ? normalizePhone(identifier) : null;
  if (!phone) return null;
  if (usesFileAuthStore()) {
    const matches = (await fileUsers()).filter(account => account.role === role && account.phone === phone);
    return matches.length === 1 ? matches[0] : null;
  }
  const result = await databasePool().query(
    'SELECT id::text AS id, role, email, phone, first_name AS "firstName", last_name AS "lastName", password_salt AS salt, password_hash AS hash, created_at AS "createdAt" FROM users WHERE role = $1 AND phone = $2',
    [role, phone],
  );
  return result.rowCount === 1 ? result.rows[0] : null;
}
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
}
async function passwordMatches(password, account) {
  const result = await passwordHash(password, account.salt);
  return timingSafeEqual(Buffer.from(result.hash, 'hex'), Buffer.from(account.hash, 'hex'));
}
function publicAccount(account) {
  return { id: account.id, role: account.role, email: account.email, phone: account.phone || null, firstName: account.firstName || null, lastName: account.lastName || null, createdAt: account.createdAt };
}

function send(res, status, data, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(contentType === 'application/json' ? JSON.stringify(data) : data);
}
function fail(res, status, code, message) { send(res, status, { error: { code, message } }); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 7_000_000) throw new Error('TOO_LARGE');
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('INVALID_JSON'); }
}
function positive(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0; }
function text(v) { return typeof v === 'string' && v.trim().length > 0; }
function publicListing(l) { return { ...l, imageUrl: l.photoId ? `/api/photos/${l.photoId}` : null }; }

export async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/demo-seller') return send(res, 200, seller);
    if (req.method === 'POST' && path === '/api/auth/register') {
      const b = await body(req);
      const role = b.role === 'seller' ? 'seller' : b.role === 'customer' ? 'customer' : null;
      const email = normalizeEmail(b.email);
      const password = String(b.password || '');
      const phone = role === 'seller' ? normalizePhone(b.phone) : null;
      const firstName = typeof b.firstName === 'string' ? b.firstName.trim() : '';
      const lastName = typeof b.lastName === 'string' ? b.lastName.trim() : '';
      if (!firstName || !lastName || [...firstName].length > 100 || [...lastName].length > 100 || /[\p{Cc}\p{Cf}]/u.test(firstName + lastName)) {
        return fail(res, 400, 'INVALID_NAME', 'First and last names must contain 1 to 100 characters');
      }
      if (!role || !EMAIL.test(email) || password.length < 8 || (role === 'seller' && !phone)) {
        return fail(res, 400, 'INVALID_AUTH_INPUT', 'Enter a valid email, an 8-character password, and a valid Indian phone number for sellers');
      }
      if (await findAccount(email)) return fail(res, 409, 'ACCOUNT_EXISTS', 'An account already exists for this email');
      const { salt, hash } = await passwordHash(password);
      const account = { id: randomUUID(), role, email, phone, firstName, lastName, salt, hash, createdAt: new Date().toISOString() };
      await saveAccount(account);
      return send(res, 201, { account: publicAccount(account) });
    }
    if (req.method === 'POST' && path === '/api/auth/login') {
      const b = await body(req);
      const role = b.role === 'seller' ? 'seller' : b.role === 'customer' ? 'customer' : null;
      const identifier = String(b.identifier || b.email || '').trim();
      const password = String(b.password || '');
      if (!role || (!EMAIL.test(identifier) && !(role === 'seller' && normalizePhone(identifier))) || !password) return fail(res, 400, 'INVALID_AUTH_INPUT', 'Enter a valid email or seller phone number and password');
      const account = await findLoginAccount(identifier, role);
      if (!account || !(await passwordMatches(password, account))) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email, password, or account type is incorrect');
      return send(res, 200, { account: publicAccount(account) });
    }
    if (req.method === 'POST' && path === '/api/listing-photos') {
      const b = await body(req);
      if (b.sellerId !== seller.id || !text(b.clientPhotoId) || !['image/jpeg', 'image/png', 'image/webp'].includes(b.mimeType) || !text(b.base64)) return fail(res, 400, 'INVALID_INPUT', 'A valid seller, photo ID, image type and image data are required');
      if (!/^[A-Za-z0-9+/=]+$/.test(b.base64) || b.base64.length > 5_500_000) return fail(res, 400, 'INVALID_IMAGE', 'Invalid or oversized image');
      const key = `${b.sellerId}:${b.clientPhotoId}`;
      if (photoIds.has(key)) return send(res, 200, { photoId: photoIds.get(key) });
      const id = randomUUID();
      photos.set(id, { bytes: Buffer.from(b.base64, 'base64'), mimeType: b.mimeType, sellerId: b.sellerId });
      photoIds.set(key, id);
      return send(res, 201, { photoId: id });
    }
    const photoMatch = path.match(/^\/api\/photos\/([^/]+)$/);
    if (req.method === 'GET' && photoMatch) {
      const p = photos.get(photoMatch[1]);
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Photo not found');
      return send(res, 200, p.bytes, p.mimeType);
    }
    if (req.method === 'POST' && path === '/api/listings') {
      const b = await body(req);
      if (b.sellerId !== seller.id || !text(b.clientDraftId) || !text(b.title) || !text(b.category) || !positive(b.quantity) || !['kg', 'piece'].includes(b.unit) || !positive(b.unitPriceRupees) || !positive(b.estimatedWeightKgPerUnit) || !positive(b.packageLengthCmPerUnit) || !positive(b.packageWidthCmPerUnit) || !positive(b.packageHeightCmPerUnit) || !text(b.photoId) || !photos.has(b.photoId)) return fail(res, 400, 'INVALID_INPUT', 'Complete listing and photo are required');
      const key = `${b.sellerId}:${b.clientDraftId}`;
      if (draftIds.has(key)) return send(res, 200, publicListing(listings.get(draftIds.get(key))));
      const id = randomUUID();
      const l = { id, sellerId: b.sellerId, title: b.title.trim(), category: b.category, description: String(b.description || ''), quantity: b.quantity, availableQuantity: b.quantity, unit: b.unit, unitPriceRupees: b.unitPriceRupees, estimatedWeightKgPerUnit: b.estimatedWeightKgPerUnit, packageLengthCmPerUnit: b.packageLengthCmPerUnit, packageWidthCmPerUnit: b.packageWidthCmPerUnit, packageHeightCmPerUnit: b.packageHeightCmPerUnit, village: String(b.village || seller.village), pickupLocation: b.pickupLocation || { lat: 19.5939, lng: 81.6689 }, photoId: b.photoId, status: 'active' };
      listings.set(id, l); draftIds.set(key, id);
      return send(res, 201, publicListing(l));
    }
    if (req.method === 'GET' && path === '/api/listings') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return send(res, 200, { listings: [...listings.values()].filter(l => l.status === 'active' && l.title.toLowerCase().includes(q)).map(publicListing) });
    }
    const listingMatch = path.match(/^\/api\/listings\/([^/]+)$/);
    if (req.method === 'GET' && listingMatch) {
      const l = listings.get(listingMatch[1]);
      return l ? send(res, 200, publicListing(l)) : fail(res, 404, 'NOT_FOUND', 'Listing not found');
    }
    if (req.method === 'POST' && path === '/api/requests') {
      const b = await body(req); const l = listings.get(b.listingId);
      if (!l || !text(b.buyerName) || !/^\+?[0-9]{10,15}$/.test(String(b.buyerPhone || '')) || !positive(b.quantity) || b.quantity > l.availableQuantity) return fail(res, 400, 'INVALID_INPUT', 'Valid listing, buyer and available quantity are required');
      const id = randomUUID();
      const r = { id, listingId: l.id, sellerId: l.sellerId, buyerName: b.buyerName.trim(), buyerPhone: b.buyerPhone, sellerPhone: seller.phone, quantity: b.quantity, unit: l.unit, requestedUnitPriceRupees: l.unitPriceRupees, status: 'pending', createdAt: new Date().toISOString() };
      requests.set(id, r); return send(res, 201, r);
    }
    const requestMatch = path.match(/^\/api\/requests\/([^/]+)$/);
    if (req.method === 'GET' && requestMatch) {
      const r = requests.get(requestMatch[1]); return r ? send(res, 200, r) : fail(res, 404, 'NOT_FOUND', 'Request not found');
    }
    const sellerRequests = path.match(/^\/api\/sellers\/([^/]+)\/requests$/);
    if (req.method === 'GET' && sellerRequests) return send(res, 200, { requests: [...requests.values()].filter(r => r.sellerId === sellerRequests[1]) });
    const statusMatch = path.match(/^\/api\/requests\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      const r = requests.get(statusMatch[1]); if (!r) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      const b = await body(req);
      if (r.status !== 'pending') return fail(res, 409, 'INVALID_STATE', 'Request is no longer pending');
      if (b.action === 'withdraw' || b.action === 'decline') { r.status = b.action === 'withdraw' ? 'withdrawn' : 'declined'; return send(res, 200, r); }
      if (b.action !== 'accept') return fail(res, 400, 'INVALID_INPUT', 'Unknown action');
      const l = listings.get(r.listingId);
      if (!positive(b.exactQuantity) || !positive(b.unitPriceRupees) || !positive(b.totalPriceRupees) || Math.abs(b.exactQuantity * b.unitPriceRupees - b.totalPriceRupees) > 0.01) return fail(res, 400, 'INVALID_TERMS', 'Price and quantity do not match total');
      if (b.exactQuantity !== r.quantity || b.unitPriceRupees !== r.requestedUnitPriceRupees) return fail(res, 409, 'COUNTEROFFER_REQUIRED', 'Changed terms require buyer approval in a later sprint');
      if (l.availableQuantity < b.exactQuantity) return fail(res, 409, 'STOCK_UNAVAILABLE', 'Not enough stock');
      l.availableQuantity -= b.exactQuantity;
      r.status = 'accepted'; r.acceptedQuantity = b.exactQuantity; r.acceptedUnitPriceRupees = b.unitPriceRupees; r.acceptedTotalPriceRupees = b.totalPriceRupees;
      return send(res, 200, r);
    }
    if (req.method === 'POST' && path === '/api/transport/matches') {
      const b = await body(req);
      if (TRANSPORT_API_BASE_URL) {
        try {
          const response = await fetch(`${TRANSPORT_API_BASE_URL.replace(/\/$/, '')}/v1/matches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(8000) });
          return send(res, response.status, await response.json());
        } catch { return fail(res, 503, 'TRANSPORT_UNAVAILABLE', 'Transport service unavailable'); }
      }
      const nearKondagaon = Math.abs(Number(b.origin?.lat) - 19.5939) < 0.15;
      const nearRaipur = Math.abs(Number(b.destination?.lat) - 21.2514) < 0.15;
      const fits = Number(b.loadKg) <= 300 && Number(b.packageLengthCm) <= 300 && Number(b.packageWidthCm) <= 180 && Number(b.packageHeightCm) <= 180;
      if (!nearKondagaon || !nearRaipur || !fits || Number(b.pickupRadiusKm) < 7.4 || Number(b.dropRadiusKm) < 6.1) return send(res, 200, { matches: [], demoFixture: true });
      return send(res, 200, { demoFixture: true, matches: [{
        tripId: 'sample-kondagaon-raipur', transporterName: 'Sample transporter', transporterPhone: '+910000000000', vehicleType: 'medium_truck',
        availableCapacityKg: 300, departAt: new Date(Date.now() + 86400000).toISOString(), routeSummary: 'Sample Kondagaon → Raipur via Kanker',
        pickupPoint: { name: 'Sample pickup near Kondagaon', lat: 19.65, lng: 81.66 }, dropPoint: { name: 'Sample drop near Raipur', lat: 21.20, lng: 81.64 },
        pickupDistanceKm: 7.4, dropDistanceKm: 6.1, sharedRouteKm: 230, fitStatus: 'potential_fit',
        explanation: 'Sample route only. Confirm availability and loading by phone.'
      }] });
    }
    return fail(res, 404, 'NOT_FOUND', 'Endpoint not found');
  } catch (e) {
    if (e.message === 'TOO_LARGE') return fail(res, 413, 'TOO_LARGE', 'Request too large');
    if (e.message === 'INVALID_JSON') return fail(res, 400, 'INVALID_JSON', 'Invalid JSON');
    return fail(res, 500, 'SERVER_ERROR', 'Unexpected server error');
  }
}

export const server = http.createServer(handle);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(PORT, '0.0.0.0', () => console.log(`Marketplace API on ${PORT}`));
