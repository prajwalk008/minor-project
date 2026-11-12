import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from './index.js';

function createTestSessionStore() {
  const sessions = new Map();
  return {
    sessions,
    async create(session) {
      sessions.set(session.id, { ...session, revokedAt: null });
    },
    async findByTokenHash(tokenHash) {
      return [...sessions.values()].find(session => session.tokenHash === tokenHash);
    },
    async revokeById(id) {
      const session = sessions.get(id);
      if (!session || session.revokedAt) return false;
      session.revokedAt = new Date();
      return true;
    },
    expireToken(token) {
      const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
      const session = [...sessions.values()].find(item => item.tokenHash === tokenHash);
      assert.ok(session);
      session.expiresAt = new Date(Date.now() - 1000);
    },
  };
}

function createTestMarketplaceStore() {
  const listings = new Map();
  const photos = new Map();
  const requests = new Map();
  return {
    async createListingPhoto(photo) {
      const existing = [...photos.values()].find(item =>
        item.sellerId === photo.sellerId && item.clientPhotoId === photo.clientPhotoId,
      );
      if (existing) return existing;
      const record = { ...photo, createdAt: new Date().toISOString() };
      photos.set(record.id, record);
      return record;
    },
    async findListingPhotoByClientId(sellerId, clientPhotoId) {
      return [...photos.values()].find(item =>
        item.sellerId === sellerId && item.clientPhotoId === clientPhotoId,
      ) || null;
    },
    async findListingPhotoById(id) {
      return photos.get(id) || null;
    },
    async createListing(listing) {
      const existing = [...listings.values()].find(item =>
        item.sellerId === listing.sellerId && item.clientDraftId === listing.clientDraftId,
      );
      if (existing) return existing;
      const record = { ...listing, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      listings.set(record.id, record);
      return record;
    },
    async findListingsBySeller(sellerId) {
      return [...listings.values()].filter(item => item.sellerId === sellerId);
    },
    async findActiveListings(search = '') {
      const query = search.toLowerCase();
      return [...listings.values()].filter(item =>
        item.status === 'active' && item.title.toLowerCase().includes(query),
      );
    },
    async findListingById(id) {
      return listings.get(id) || null;
    },
    async createBuyerRequest(request) {
      const record = {
        ...request,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      requests.set(record.id, record);
      return record;
    },
    async findRequestById(id) {
      return requests.get(id) || null;
    },
    async findRequestsBySeller(sellerId) {
      return [...requests.values()].filter(item => item.sellerId === sellerId);
    },
    async findRequestsByBuyer(buyerId) {
      return [...requests.values()].filter(item => item.buyerId === buyerId);
    },
    async updateRequestStatus(id, update) {
      const record = requests.get(id);
      if (!record || record.status !== update.expectedStatus ||
          (update.sellerId && record.sellerId !== update.sellerId) ||
          (update.buyerId && record.buyerId !== update.buyerId)) return null;
      Object.assign(record, {
        status: update.status,
        acceptedQuantity: update.acceptedQuantity,
        acceptedUnitPriceRupees: update.acceptedUnitPriceRupees,
        acceptedTotalPriceRupees: update.acceptedTotalPriceRupees,
        updatedAt: new Date().toISOString(),
      });
      return record;
    },
    async acceptRequestAndDecrementStock(update) {
      const record = requests.get(update.requestId);
      if (!record || record.sellerId !== update.sellerId) return null;
      if (record.status !== 'pending') {
        const error = new Error('Request is no longer pending');
        error.code = 'REQUEST_NOT_PENDING';
        throw error;
      }
      const listing = listings.get(record.listingId);
      if (!listing || listing.status !== 'active' || listing.availableQuantity < update.acceptedQuantity) {
        const error = new Error('Not enough active listing stock');
        error.code = 'STOCK_UNAVAILABLE';
        throw error;
      }
      listing.availableQuantity -= update.acceptedQuantity;
      Object.assign(record, {
        status: 'accepted',
        acceptedQuantity: update.acceptedQuantity,
        acceptedUnitPriceRupees: update.acceptedUnitPriceRupees,
        acceptedTotalPriceRupees: update.acceptedTotalPriceRupees,
        updatedAt: new Date().toISOString(),
      });
      return record;
    },
  };
}

test('photo and listing retries are idempotent; withdrawn and accepted orders obey stock', async () => {
  const testDirectory = await mkdtemp(join(tmpdir(), 'minor-project-marketplace-'));
  const previousAuthDataFile = process.env.AUTH_DATA_FILE;
  const authDataFile = join(testDirectory, 'users.json');
  process.env.AUTH_DATA_FILE = authDataFile;
  const sessionStore = createTestSessionStore();
  const marketplaceStore = createTestMarketplaceStore();
  const testServer = createServer(sessionStore, marketplaceStore);
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${testServer.address().port}`;
  const call = async (path, method = 'GET', payload, token) => {
    const headers = {};
    if (payload) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(base + path, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, data: await response.json() };
  };
  try {
    const register = async (role, email) => call('/api/auth/register', 'POST', {
      role, email, password: 'password1', firstName: 'Test', lastName: role,
      ...(role === 'seller' ? { phone: '9876543210' } : {}),
    });
    const sellerAccount = await register('seller', 'seller@example.com');
    const buyerAccount = await register('customer', 'buyer@example.com');
    const otherSeller = await register('seller', 'other-seller@example.com');
    const otherBuyer = await register('customer', 'other-buyer@example.com');
    assert.equal(sellerAccount.status, 201);
    assert.equal(buyerAccount.status, 201);

    const photoInput = { clientPhotoId: 'test-photo', mimeType: 'image/png', base64: 'iVBORw0KGgo=' };
    assert.equal((await call('/api/listing-photos', 'POST', photoInput)).status, 401);
    assert.equal((await call('/api/listing-photos', 'POST', photoInput, buyerAccount.data.token)).status, 403);
    const photo1 = await call('/api/listing-photos', 'POST', photoInput, sellerAccount.data.token);
    const photo2 = await call('/api/listing-photos', 'POST', photoInput, sellerAccount.data.token);
    assert.equal(photo1.data.photoId, photo2.data.photoId);
    const storedPhoto = await fetch(`${base}/api/photos/${photo1.data.photoId}`);
    assert.equal(storedPhoto.status, 200);
    assert.equal(storedPhoto.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await storedPhoto.arrayBuffer()), Buffer.from(photoInput.base64, 'base64'));
    const listingInput = { sellerId: otherSeller.data.account.id, clientDraftId: 'test-draft', photoId: photo1.data.photoId, title: 'Bell metal craft', category: 'handicraft', quantity: 2, unit: 'piece', unitPriceRupees: 500, estimatedWeightKgPerUnit: 1, packageLengthCmPerUnit: 20, packageWidthCmPerUnit: 20, packageHeightCmPerUnit: 20 };
    assert.equal((await call('/api/listings', 'POST', listingInput)).status, 401);
    assert.equal((await call('/api/listings', 'POST', listingInput, buyerAccount.data.token)).status, 403);
    const listing1 = await call('/api/listings', 'POST', listingInput, sellerAccount.data.token);
    const listing2 = await call('/api/listings', 'POST', listingInput, sellerAccount.data.token);
    assert.equal(listing1.data.id, listing2.data.id);
    assert.equal(listing1.data.sellerId, sellerAccount.data.account.id);
    assert.equal((await call(`/api/listings/${listing1.data.id}`)).data.title, 'Bell metal craft');
    assert.equal((await call('/api/listings?q=bell')).data.listings.length, 1);
    const otherSellerPhotoListing = await call('/api/listings', 'POST', { ...listingInput, clientDraftId: 'other-seller-draft' }, otherSeller.data.token);
    assert.equal(otherSellerPhotoListing.status, 400);
    const orderInput = { listingId: listing1.data.id, buyerId: otherBuyer.data.account.id, buyerName: 'Spoofed name', buyerPhone: '+910000000001', quantity: 1 };
    assert.equal((await call('/api/requests', 'POST', orderInput)).status, 401);
    assert.equal((await call('/api/requests', 'POST', orderInput, sellerAccount.data.token)).status, 403);
    const order = () => call('/api/requests', 'POST', orderInput, buyerAccount.data.token);
    const r1 = await order();
    assert.equal(r1.data.buyerId, undefined);
    assert.equal(r1.data.buyerName, 'Test customer');
    assert.equal((await call('/api/buyers/me/requests')).status, 401);
    assert.equal((await call('/api/buyers/me/requests', 'GET', undefined, sellerAccount.data.token)).status, 403);
    assert.equal((await call(`/api/buyers/me/requests?buyerId=${otherBuyer.data.account.id}`, 'GET', undefined, buyerAccount.data.token)).data.requests.length, 1);
    assert.equal((await call(`/api/requests/${r1.data.id}`, 'GET', undefined, otherBuyer.data.token)).status, 404);
    assert.equal((await call(`/api/requests/${r1.data.id}`, 'GET', undefined, otherSeller.data.token)).status, 404);
    assert.equal((await call(`/api/requests/${r1.data.id}`, 'GET', undefined, sellerAccount.data.token)).status, 200);
    assert.equal((await call(`/api/requests/${r1.data.id}`, 'GET')).status, 401);
    assert.equal((await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'withdraw' })).status, 401);
    assert.equal((await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'withdraw' }, otherBuyer.data.token)).status, 404);
    assert.equal((await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'withdraw' }, sellerAccount.data.token)).status, 404);
    const sellerRequests = await call(`/api/sellers/${sellerAccount.data.account.id}/requests`, 'GET', undefined, sellerAccount.data.token);
    assert.equal(sellerRequests.data.requests.length, 1);
    assert.equal((await call(`/api/sellers/${sellerAccount.data.account.id}/requests`)).status, 401);
    assert.equal((await call(`/api/sellers/${sellerAccount.data.account.id}/requests`, 'GET', undefined, buyerAccount.data.token)).status, 403);
    assert.equal((await call(`/api/sellers/${otherSeller.data.account.id}/requests`, 'GET', undefined, sellerAccount.data.token)).status, 404);
    assert.equal((await call(`/api/sellers/${otherSeller.data.account.id}/requests`, 'GET', undefined, otherSeller.data.token)).data.requests.length, 0);
    const buyerWithdrawn = await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'withdraw' }, buyerAccount.data.token);
    assert.equal(buyerWithdrawn.data.status, 'withdrawn');
    const lateAccept = await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, sellerAccount.data.token);
    assert.equal(lateAccept.status, 409);
    const r2 = await order();
    const r3 = await order();
    const r4 = await order();
    assert.equal((await call(`/api/requests/${r2.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, otherSeller.data.token)).status, 404);
    assert.equal((await call(`/api/requests/${r2.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, buyerAccount.data.token)).status, 404);
    const accepted = await call(`/api/requests/${r2.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, sellerAccount.data.token);
    assert.equal(accepted.data.status, 'accepted');
    const duplicate = await call(`/api/requests/${r2.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, sellerAccount.data.token);
    assert.equal(duplicate.status, 409);
    const listingAfter = await call(`/api/listings/${listing1.data.id}`, 'GET');
    assert.equal(listingAfter.data.availableQuantity, 1);
    const acceptedSecond = await call(`/api/requests/${r3.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, sellerAccount.data.token);
    assert.equal(acceptedSecond.data.status, 'accepted');
    assert.equal((await call(`/api/requests/${r4.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 }, sellerAccount.data.token)).status, 409);
    assert.equal((await call(`/api/listings/${listing1.data.id}`)).data.availableQuantity, 0);
    assert.equal((await call(`/api/buyers/me/requests`, 'GET', undefined, otherBuyer.data.token)).data.requests.length, 0);
    assert.equal((await call(`/api/requests/${r4.data.id}/status`, 'PATCH', { action: 'decline' }, sellerAccount.data.token)).data.status, 'declined');
  } finally {
    await new Promise(resolve => testServer.close(resolve));
    if (previousAuthDataFile === undefined) delete process.env.AUTH_DATA_FILE;
    else process.env.AUTH_DATA_FILE = previousAuthDataFile;
    await rm(testDirectory, { recursive: true, force: true });
  }
});

test('customer and seller accounts validate details and can log in again', async () => {
  const testDirectory = await mkdtemp(join(tmpdir(), 'minor-project-auth-'));
  const previousAuthDataFile = process.env.AUTH_DATA_FILE;
  const sessionStore = createTestSessionStore();
  const authServer = createServer(sessionStore);
  process.env.AUTH_DATA_FILE = join(testDirectory, 'users.json');
  await new Promise(resolve => authServer.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + authServer.address().port;
  const call = async (path, payload) => {
    if (path === '/api/auth/register') payload = { firstName: 'अनिता', lastName: 'Kumar', ...payload };
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: response.status, data: await response.json() };
  };
  const logout = async token => {
    const response = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const invalidName = await call('/api/auth/register', { role: 'customer', email: 'missing@example.com', password: 'password1', firstName: '   ' });
    assert.equal(invalidName.status, 400);
    assert.equal(invalidName.data.error.code, 'INVALID_NAME');
    const longName = await call('/api/auth/register', { role: 'customer', email: 'long@example.com', password: 'password1', lastName: 'a'.repeat(101) });
    assert.equal(longName.status, 400);
    const invalidCustomer = await call('/api/auth/register', { role: 'customer', email: 'not-an-email', password: 'password1' });
    assert.equal(invalidCustomer.status, 400);
    const customer = await call('/api/auth/register', { role: 'customer', email: 'buyer@example.com', password: 'password1' });
    assert.equal(customer.status, 201);
    assert.equal(customer.data.account.phone, null);
    assert.equal(customer.data.account.firstName, 'अनिता');
    assert.equal(customer.data.account.lastName, 'Kumar');
    assert.match(customer.data.token, /^[0-9a-f]{64}$/);
    assert.ok(Date.parse(customer.data.expiresAt) > Date.now());
    const registrationSession = [...sessionStore.sessions.values()].find(session => session.userId === customer.data.account.id);
    assert.ok(registrationSession);
    assert.equal(registrationSession.tokenHash, createHash('sha256').update(customer.data.token, 'utf8').digest('hex'));
    assert.equal(registrationSession.expiresAt.getTime() - registrationSession.createdAt.getTime(), 7 * 24 * 60 * 60 * 1000);
    assert.equal(JSON.stringify([...sessionStore.sessions.values()]).includes(customer.data.token), false);
    assert.equal((await logout()).status, 401);
    assert.equal((await logout('not-a-valid-token')).status, 401);
    assert.equal((await logout('a'.repeat(64))).status, 401);
    assert.equal((await logout(customer.data.token)).status, 200);
    assert.equal((await logout(customer.data.token)).status, 401);

    const expiredLogin = await call('/api/auth/login', { role: 'customer', identifier: 'buyer@example.com', password: 'password1' });
    assert.equal(expiredLogin.status, 200);
    assert.ok([...sessionStore.sessions.values()].some(session =>
      session.tokenHash === createHash('sha256').update(expiredLogin.data.token, 'utf8').digest('hex'),
    ));
    sessionStore.expireToken(expiredLogin.data.token);
    assert.equal((await logout(expiredLogin.data.token)).status, 401);

    const firstLiveLogin = await call('/api/auth/login', { role: 'customer', identifier: 'buyer@example.com', password: 'password1' });
    const secondLiveLogin = await call('/api/auth/login', { role: 'customer', identifier: 'buyer@example.com', password: 'password1' });
    assert.equal((await logout(firstLiveLogin.data.token)).status, 200);
    assert.equal((await logout(secondLiveLogin.data.token)).status, 200);

    const seller = await call('/api/auth/register', { role: 'seller', email: 'seller@example.com', phone: '9876543210', password: 'password1' });
    assert.equal(seller.status, 201);
    assert.equal(seller.data.account.phone, '+919876543210');
    assert.match(seller.data.token, /^[0-9a-f]{64}$/);
    for (const identifier of ['seller@example.com', '9876543210', '+91 9876543210']) {
      const sellerLogin = await call('/api/auth/login', { role: 'seller', identifier, password: 'password1' });
      assert.equal(sellerLogin.status, 200);
      assert.match(sellerLogin.data.token, /^[0-9a-f]{64}$/);
      assert.equal(sellerLogin.data.account.id, seller.data.account.id);
      assert.equal(sellerLogin.data.account.firstName, 'अनिता');
      assert.equal(sellerLogin.data.account.lastName, 'Kumar');
      assert.equal(sellerLogin.data.account.hash, undefined);
    }
    const wrongSellerPassword = await call('/api/auth/login', { role: 'seller', identifier: '9876543210', password: 'wrongpass' });
    assert.equal(wrongSellerPassword.status, 401);
    const duplicate = await call('/api/auth/register', { role: 'customer', email: 'buyer@example.com', password: 'password1' });
    assert.equal(duplicate.status, 409);
    const rejectedLogin = await call('/api/auth/login', { role: 'customer', email: 'buyer@example.com', password: 'wrongpass' });
    assert.equal(rejectedLogin.status, 401);
    const login = await call('/api/auth/login', { role: 'customer', email: 'buyer@example.com', password: 'password1' });
    assert.equal(login.status, 200);
    assert.equal(login.data.account.email, 'buyer@example.com');
  } finally {
    await new Promise(resolve => authServer.close(resolve));
    if (previousAuthDataFile === undefined) delete process.env.AUTH_DATA_FILE;
    else process.env.AUTH_DATA_FILE = previousAuthDataFile;
    await rm(testDirectory, { recursive: true, force: true });
  }
});

test('default PostgreSQL sessions reject file-backed account mode before registration writes', async () => {
  const testDirectory = await mkdtemp(join(tmpdir(), 'minor-project-auth-config-'));
  const previousAuthDataFile = process.env.AUTH_DATA_FILE;
  const authDataFile = join(testDirectory, 'users.json');
  process.env.AUTH_DATA_FILE = authDataFile;
  const configServer = createServer();
  await new Promise(resolve => configServer.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${configServer.address().port}`;
  const call = async (path, payload) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const registration = await call('/api/auth/register', {
      role: 'customer', email: 'blocked@example.com', password: 'password1', firstName: 'Test', lastName: 'Buyer',
    });
    assert.equal(registration.status, 503);
    assert.equal(registration.data.error.code, 'AUTH_STORAGE_CONFIGURATION');
    const login = await call('/api/auth/login', { role: 'customer', identifier: 'blocked@example.com', password: 'password1' });
    assert.equal(login.status, 503);
    assert.equal(login.data.error.code, 'AUTH_STORAGE_CONFIGURATION');
    await assert.rejects(readFile(authDataFile), { code: 'ENOENT' });
  } finally {
    await new Promise(resolve => configServer.close(resolve));
    if (previousAuthDataFile === undefined) delete process.env.AUTH_DATA_FILE;
    else process.env.AUTH_DATA_FILE = previousAuthDataFile;
    await rm(testDirectory, { recursive: true, force: true });
  }
});
