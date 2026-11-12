import http from 'node:http';
import { createHash, randomUUID, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import * as productStore from './products.js';
import {
  acceptRequestAndDecrementStock,
  createSessionRecord,
  createBuyerRequest,
  createListing,
  createListingPhoto,
  databasePool,
  findActiveListings,
  findListingById,
  findListingPhotoByClientId,
  findListingPhotoById,
  findListingsBySeller,
  findRequestById,
  findRequestsByBuyer,
  findRequestsBySeller,
  findSessionByTokenHash,
  revokeSessionById,
  updateRequestStatus,
  usesFileAuthStore,
} from './db.js';

const PORT = Number(process.env.PORT || 4000);
const TRANSPORT_API_BASE_URL = process.env.TRANSPORT_API_BASE_URL;
const scrypt = promisify(scryptCallback);
const seller = { id: 'demo-seller', name: 'Demo Kondagaon Seller', phone: '+910000000000', village: 'Kondagaon', district: 'Kondagaon' };
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
async function findAccountById(id) {
  if (usesFileAuthStore()) {
    return (await fileUsers()).find(account => account.id === id);
  }
  const result = await databasePool().query(
    'SELECT id::text AS id, role, email, phone, first_name AS "firstName", last_name AS "lastName", password_salt AS salt, password_hash AS hash, created_at AS "createdAt" FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0];
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

const databaseSessionStore = {
  create: createSessionRecord,
  findByTokenHash: findSessionByTokenHash,
  revokeById: revokeSessionById,
};
const databaseMarketplaceStore = {
  ...productStore,
  createListing,
  createListingPhoto,
  createBuyerRequest,
  findActiveListings,
  findListingById,
  findListingPhotoByClientId,
  findListingPhotoById,
  findListingsBySeller,
  findRequestById,
  findRequestsByBuyer,
  findRequestsBySeller,
  updateRequestStatus,
  acceptRequestAndDecrementStock,
};
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashSessionToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function createSession(userId, sessionStore) {
  const token = randomBytes(32).toString('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DURATION_MS);
  await sessionStore.create({
    id: randomUUID(),
    userId,
    tokenHash: hashSessionToken(token),
    createdAt,
    expiresAt,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function verifyBearerSession(req, sessionStore = databaseSessionStore) {
  const match = /^Bearer ([0-9a-f]{64})$/i.exec(req.headers.authorization || '');
  if (!match) return null;

  const session = await sessionStore.findByTokenHash(hashSessionToken(match[1]));
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return { id: session.id, userId: session.userId };
}

function send(res, status, data, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
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
function uuid(v) { return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function publicListing(l) { return { ...l, imageUrl: l.photoId ? `/api/photos/${l.photoId}` : null }; }
async function enrichedListings(items, store) {
  const summaries = await store.getProductSummaries(items.map(item => item.id));
  const byId = new Map(summaries.map(item => [item.id, item]));
  return items.map(item => ({ ...publicListing(item), ...byId.get(item.id) }));
}
// Decode only supported raster image signatures. Reject forged MIME types and malformed base64.
function reviewImage(input) {
  if (!input || typeof input.base64 !== 'string' || input.base64.length > 1_333_336 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)) return null;
  const bytes = Buffer.from(input.base64, 'base64');
  if (!bytes.length || bytes.length > 1_000_000) return null;
  const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  return mimeType && mimeType === input.mimeType ? { id: randomUUID(), mimeType, bytes } : null;
}
function publicRequest(request) {
  const visibleRequest = { ...request };
  delete visibleRequest.buyerId;
  return visibleRequest;
}
function authStorageConfigured(sessionStore) {
  return sessionStore !== databaseSessionStore || !usesFileAuthStore();
}
async function requireAuthenticatedAccount(req, res, sessionStore) {
  if (!authStorageConfigured(sessionStore)) {
    fail(res, 503, 'AUTH_STORAGE_CONFIGURATION', 'AUTH_DATA_FILE is not supported with PostgreSQL-backed sessions; unset it to use database-backed authentication');
    return null;
  }
  const session = await verifyBearerSession(req, sessionStore);
  if (!session) {
    fail(res, 401, 'AUTH_REQUIRED', 'A valid bearer token is required');
    return null;
  }
  const account = await findAccountById(session.userId);
  if (!account) {
    fail(res, 401, 'AUTH_REQUIRED', 'A valid bearer token is required');
    return null;
  }
  return account;
}

export async function handle(req, res, sessionStore = databaseSessionStore, marketplaceStore = databaseMarketplaceStore) {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/demo-seller') return send(res, 200, seller);
    const publicSeller = path.match(/^\/api\/sellers\/([^/]+)$/);
    if (req.method === 'GET' && publicSeller) {
      if (!uuid(publicSeller[1])) return fail(res, 404, 'NOT_FOUND', 'Seller not found');
      const account = await findAccountById(publicSeller[1]);
      if (!account || account.role !== 'seller') return fail(res, 404, 'NOT_FOUND', 'Seller not found');
      const items = (await marketplaceStore.findListingsBySeller(account.id)).filter(item => item.status === 'active');
      return send(res, 200, { seller: { id: account.id, name: [account.firstName, account.lastName].filter(Boolean).join(' ') || 'Seller', joinedAt: account.createdAt }, listings: await enrichedListings(items, marketplaceStore) });
    }
    const reviewsRoute = path.match(/^\/api\/listings\/([^/]+)\/reviews(\/eligibility)?$/);
    if (reviewsRoute) {
      const listingId = reviewsRoute[1];
      if (!uuid(listingId) || !await marketplaceStore.findListingById(listingId)) return fail(res, 404, 'NOT_FOUND', 'Product not found');
      if (req.method === 'GET' && !reviewsRoute[2]) return send(res, 200, { reviews: await marketplaceStore.getProductReviews(listingId) });
      if ((req.method === 'GET' && reviewsRoute[2]) || (req.method === 'POST' && !reviewsRoute[2])) {
        const account = await requireAuthenticatedAccount(req, res, sessionStore);
        if (!account) return;
        if (account.role !== 'customer') return fail(res, 403, 'FORBIDDEN', 'A customer account is required');
        const eligibility = await marketplaceStore.getReviewEligibility(listingId, account.id);
        if (req.method === 'GET') return send(res, 200, eligibility);
        if (!eligibility.purchased) return fail(res, 403, 'PURCHASE_REQUIRED', 'Confirm receipt of your purchase before reviewing');
        if (eligibility.reviewed) return fail(res, 409, 'REVIEW_EXISTS', 'You already reviewed this product');
        const b = await body(req);
        const uploads = b.images ?? [];
        if (!Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5 || typeof b.body !== 'string' || !b.body.trim() || b.body.trim().length > 2000 || !Array.isArray(uploads) || uploads.length > 3) return fail(res, 400, 'INVALID_REVIEW', 'A rating, 1–2000 characters and at most three images are required');
        const images = uploads.map(reviewImage);
        if (images.some(image => !image)) return fail(res, 400, 'INVALID_IMAGE', 'Use JPEG, PNG or WebP images up to 1 MB each');
        try {
          await marketplaceStore.createProductReview({ id: randomUUID(), listingId, buyerId: account.id, rating: b.rating, body: b.body.trim(), images });
        } catch (error) {
          if (error.code === '23505') return fail(res, 409, 'REVIEW_EXISTS', 'You already reviewed this product');
          if (error.code === 'PURCHASE_REQUIRED') return fail(res, 403, 'PURCHASE_REQUIRED', 'Purchase required');
          throw error;
        }
        return send(res, 201, { status: 'ok' });
      }
    }
    const reviewPhoto = path.match(/^\/api\/review-images\/([^/]+)$/);
    if (req.method === 'GET' && reviewPhoto) {
      const image = uuid(reviewPhoto[1]) ? await marketplaceStore.findReviewImage(reviewPhoto[1]) : null;
      if (!image) return fail(res, 404, 'NOT_FOUND', 'Image not found');
      return send(res, 200, image.imageData, image.mimeType);
    }
    if (req.method === 'POST' && path === '/api/auth/register') {
      if (!authStorageConfigured(sessionStore)) return fail(res, 503, 'AUTH_STORAGE_CONFIGURATION', 'AUTH_DATA_FILE is not supported with PostgreSQL-backed sessions; unset it to use database-backed authentication');
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
      const session = await createSession(account.id, sessionStore);
      return send(res, 201, { account: publicAccount(account), ...session });
    }
    if (req.method === 'POST' && path === '/api/auth/login') {
      if (!authStorageConfigured(sessionStore)) return fail(res, 503, 'AUTH_STORAGE_CONFIGURATION', 'AUTH_DATA_FILE is not supported with PostgreSQL-backed sessions; unset it to use database-backed authentication');
      const b = await body(req);
      const role = b.role === 'seller' ? 'seller' : b.role === 'customer' ? 'customer' : null;
      const identifier = String(b.identifier || b.email || '').trim();
      const password = String(b.password || '');
      if (!role || (!EMAIL.test(identifier) && !(role === 'seller' && normalizePhone(identifier))) || !password) return fail(res, 400, 'INVALID_AUTH_INPUT', 'Enter a valid email or seller phone number and password');
      const account = await findLoginAccount(identifier, role);
      if (!account || !(await passwordMatches(password, account))) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email, password, or account type is incorrect');
      const session = await createSession(account.id, sessionStore);
      return send(res, 200, { account: publicAccount(account), ...session });
    }
    if (req.method === 'POST' && path === '/api/auth/logout') {
      if (!authStorageConfigured(sessionStore)) return fail(res, 503, 'AUTH_STORAGE_CONFIGURATION', 'AUTH_DATA_FILE is not supported with PostgreSQL-backed sessions; unset it to use database-backed authentication');
      const session = await verifyBearerSession(req, sessionStore);
      if (!session) return fail(res, 401, 'AUTH_REQUIRED', 'A valid bearer token is required');
      if (!await sessionStore.revokeById(session.id)) return fail(res, 401, 'AUTH_REQUIRED', 'A valid bearer token is required');
      return send(res, 200, { status: 'ok' });
    }
    if (req.method === 'POST' && path === '/api/listing-photos') {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (account.role !== 'seller') return fail(res, 403, 'FORBIDDEN', 'A seller account is required');
      const b = await body(req);
      if (!text(b.clientPhotoId) || !['image/jpeg', 'image/png', 'image/webp'].includes(b.mimeType) || !text(b.base64)) return fail(res, 400, 'INVALID_INPUT', 'A valid photo ID, image type and image data are required');
      if (!/^[A-Za-z0-9+/=]+$/.test(b.base64) || b.base64.length > 5_500_000) return fail(res, 400, 'INVALID_IMAGE', 'Invalid or oversized image');
      const existingPhoto = await marketplaceStore.findListingPhotoByClientId(account.id, b.clientPhotoId);
      if (existingPhoto) return send(res, 200, { photoId: existingPhoto.id });
      const id = randomUUID();
      const photo = await marketplaceStore.createListingPhoto({
        id,
        sellerId: account.id,
        clientPhotoId: b.clientPhotoId,
        mimeType: b.mimeType,
        imageData: Buffer.from(b.base64, 'base64'),
      });
      return send(res, photo.id === id ? 201 : 200, { photoId: photo.id });
    }
    const photoMatch = path.match(/^\/api\/photos\/([^/]+)$/);
    if (req.method === 'GET' && photoMatch) {
      if (!uuid(photoMatch[1])) return fail(res, 404, 'NOT_FOUND', 'Photo not found');
      const p = await marketplaceStore.findListingPhotoById(photoMatch[1]);
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Photo not found');
      return send(res, 200, p.imageData, p.mimeType);
    }
    if (req.method === 'POST' && path === '/api/listings') {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (account.role !== 'seller') return fail(res, 403, 'FORBIDDEN', 'A seller account is required');
      const b = await body(req);
      const photo = uuid(b.photoId) ? await marketplaceStore.findListingPhotoById(b.photoId) : null;
      if (!text(b.clientDraftId) || !text(b.title) || !text(b.category) || !positive(b.quantity) || !['kg', 'piece'].includes(b.unit) || !positive(b.unitPriceRupees) || !positive(b.estimatedWeightKgPerUnit) || !positive(b.packageLengthCmPerUnit) || !positive(b.packageWidthCmPerUnit) || !positive(b.packageHeightCmPerUnit) || !photo || photo.sellerId !== account.id) return fail(res, 400, 'INVALID_INPUT', 'Complete listing and seller-owned photo are required');
      const existingListings = await marketplaceStore.findListingsBySeller(account.id);
      const existingListing = existingListings.find(listing => listing.clientDraftId === b.clientDraftId);
      if (existingListing) return send(res, 200, publicListing(existingListing));
      const id = randomUUID();
      const l = await marketplaceStore.createListing({
        id,
        sellerId: account.id,
        clientDraftId: b.clientDraftId,
        title: b.title.trim(),
        category: b.category,
        description: String(b.description || ''),
        quantity: b.quantity,
        availableQuantity: b.quantity,
        unit: b.unit,
        unitPriceRupees: b.unitPriceRupees,
        estimatedWeightKgPerUnit: b.estimatedWeightKgPerUnit,
        packageLengthCmPerUnit: b.packageLengthCmPerUnit,
        packageWidthCmPerUnit: b.packageWidthCmPerUnit,
        packageHeightCmPerUnit: b.packageHeightCmPerUnit,
        village: String(b.village || seller.village),
        pickupLocation: b.pickupLocation || { lat: 19.5939, lng: 81.6689 },
        photoId: b.photoId,
        status: 'active',
      });
      return send(res, l.id === id ? 201 : 200, publicListing(l));
    }
    if (req.method === 'GET' && path === '/api/listings') {
      const q = url.searchParams.get('q') || '';
      return send(res, 200, { listings: await enrichedListings(await marketplaceStore.findActiveListings(q), marketplaceStore) });
    }
    const listingMatch = path.match(/^\/api\/listings\/([^/]+)$/);
    if (req.method === 'GET' && listingMatch) {
      if (!uuid(listingMatch[1])) return fail(res, 404, 'NOT_FOUND', 'Listing not found');
      const l = await marketplaceStore.findListingById(listingMatch[1]);
      return l ? send(res, 200, (await enrichedListings([l], marketplaceStore))[0]) : fail(res, 404, 'NOT_FOUND', 'Listing not found');
    }
    if (req.method === 'POST' && path === '/api/requests') {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (account.role !== 'customer') return fail(res, 403, 'FORBIDDEN', 'A customer account is required');
      const b = await body(req);
      const l = uuid(b.listingId) ? await marketplaceStore.findListingById(b.listingId) : null;
      if (!l || l.status !== 'active' || !text(b.buyerName) || !/^\+?[0-9]{10,15}$/.test(String(b.buyerPhone || '')) || !positive(b.quantity) || b.quantity > l.availableQuantity || (l.unit === 'piece' && !Number.isInteger(b.quantity))) return fail(res, 400, 'INVALID_INPUT', 'Valid listing, buyer and available quantity are required');
      const accountName = [account.firstName, account.lastName].filter(Boolean).join(' ').trim();
      const r = await marketplaceStore.createBuyerRequest({
        id: randomUUID(),
        listingId: l.id,
        sellerId: l.sellerId,
        buyerId: account.id,
        productName: l.title,
        buyerName: accountName || b.buyerName.trim(),
        buyerPhone: b.buyerPhone,
        sellerPhone: (await findAccountById(l.sellerId))?.phone || seller.phone,
        quantity: b.quantity,
        unit: l.unit,
        requestedUnitPriceRupees: l.unitPriceRupees,
        status: 'pending',
      });
      return send(res, 201, publicRequest(r));
    }
    if (req.method === 'GET' && path === '/api/buyers/me/requests') {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (account.role !== 'customer') return fail(res, 403, 'FORBIDDEN', 'A customer account is required');
      const buyerRequests = await marketplaceStore.findRequestsByBuyer(account.id);
      return send(res, 200, { requests: buyerRequests.map(publicRequest) });
    }
    const requestMatch = path.match(/^\/api\/requests\/([^/]+)$/);
    if (req.method === 'GET' && requestMatch) {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (!uuid(requestMatch[1])) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      const r = await marketplaceStore.findRequestById(requestMatch[1]);
      if (!r) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      const isBuyer = account.role === 'customer' && r.buyerId === account.id;
      const isSeller = account.role === 'seller' && r.sellerId === account.id;
      if (!isBuyer && !isSeller) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      return send(res, 200, publicRequest(r));
    }
    const sellerRequests = path.match(/^\/api\/sellers\/([^/]+)\/requests$/);
    if (req.method === 'GET' && sellerRequests) {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (account.role !== 'seller') return fail(res, 403, 'FORBIDDEN', 'A seller account is required');
      if (sellerRequests[1] !== account.id) return fail(res, 404, 'NOT_FOUND', 'Seller not found');
      const ownedRequests = (await marketplaceStore.findRequestsBySeller(account.id)).map(publicRequest);
      return send(res, 200, { requests: ownedRequests });
    }
    const statusMatch = path.match(/^\/api\/requests\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      const account = await requireAuthenticatedAccount(req, res, sessionStore);
      if (!account) return;
      if (!uuid(statusMatch[1])) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      const r = await marketplaceStore.findRequestById(statusMatch[1]);
      if (!r) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      const b = await body(req);
      if (b.action === 'complete') {
        if (account.role !== 'customer' || r.buyerId !== account.id) return fail(res, 404, 'NOT_FOUND', 'Request not found');
        if (r.status !== 'accepted') return fail(res, 409, 'INVALID_STATE', 'Only an accepted order can be confirmed received');
        const completed = await marketplaceStore.updateRequestStatus(r.id, {
          status: 'completed', expectedStatus: 'accepted', buyerId: account.id,
          acceptedQuantity: r.acceptedQuantity, acceptedUnitPriceRupees: r.acceptedUnitPriceRupees,
          acceptedTotalPriceRupees: r.acceptedTotalPriceRupees,
        });
        if (!completed) return fail(res, 409, 'INVALID_STATE', 'Order has already changed');
        return send(res, 200, publicRequest(completed));
      }
      if (!['accept', 'decline', 'withdraw'].includes(b.action)) return fail(res, 400, 'INVALID_INPUT', 'Unknown action');
      const isBuyerWithdrawal = b.action === 'withdraw' && account.role === 'customer' && r.buyerId === account.id;
      const isSellerDecision = (b.action === 'accept' || b.action === 'decline') && account.role === 'seller' && r.sellerId === account.id;
      if (!isBuyerWithdrawal && !isSellerDecision) return fail(res, 404, 'NOT_FOUND', 'Request not found');
      if (r.status !== 'pending') return fail(res, 409, 'INVALID_STATE', 'Request is no longer pending');
      if (b.action === 'withdraw' || b.action === 'decline') {
        const updatedRequest = await marketplaceStore.updateRequestStatus(r.id, {
          status: b.action === 'withdraw' ? 'withdrawn' : 'declined',
          expectedStatus: 'pending',
          ...(b.action === 'withdraw' ? { buyerId: account.id } : { sellerId: account.id }),
        });
        if (!updatedRequest) return fail(res, 409, 'INVALID_STATE', 'Request is no longer pending');
        return send(res, 200, publicRequest(updatedRequest));
      }
      if (!positive(b.exactQuantity) || !positive(b.unitPriceRupees) || !positive(b.totalPriceRupees) || Math.abs(b.exactQuantity * b.unitPriceRupees - b.totalPriceRupees) > 0.01) return fail(res, 400, 'INVALID_TERMS', 'Price and quantity do not match total');
      if (b.exactQuantity !== r.quantity || b.unitPriceRupees !== r.requestedUnitPriceRupees) return fail(res, 409, 'COUNTEROFFER_REQUIRED', 'Changed terms require buyer approval in a later sprint');
      try {
        const acceptedRequest = await marketplaceStore.acceptRequestAndDecrementStock({
          requestId: r.id,
          sellerId: account.id,
          acceptedQuantity: b.exactQuantity,
          acceptedUnitPriceRupees: b.unitPriceRupees,
          acceptedTotalPriceRupees: b.totalPriceRupees,
        });
        if (!acceptedRequest) return fail(res, 404, 'NOT_FOUND', 'Request not found');
        return send(res, 200, publicRequest(acceptedRequest));
      } catch (error) {
        if (error.code === 'STOCK_UNAVAILABLE') return fail(res, 409, 'STOCK_UNAVAILABLE', 'Not enough stock');
        if (error.code === 'REQUEST_NOT_PENDING') return fail(res, 409, 'INVALID_STATE', 'Request is no longer pending');
        if (error.code === 'INVALID_ACCEPTED_TERMS') return fail(res, 409, 'COUNTEROFFER_REQUIRED', 'Changed terms require buyer approval in a later sprint');
        throw error;
      }
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
    console.error('Marketplace request failed', { method: req.method, path, code: e.code || 'UNKNOWN' });
    return fail(res, 500, 'SERVER_ERROR', 'Unexpected server error');
  }
}

export function createServer(sessionStore = databaseSessionStore, marketplaceStore = databaseMarketplaceStore) {
  return http.createServer((req, res) => handle(req, res, sessionStore, marketplaceStore));
}

export const server = createServer();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(PORT, '0.0.0.0', () => console.log(`Marketplace API on ${PORT}`));
