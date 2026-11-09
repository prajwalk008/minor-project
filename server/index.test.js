import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server } from './index.js';

test('photo and listing retries are idempotent; withdrawn and accepted orders obey stock', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method, payload) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, data: await response.json() };
  };
  try {
    const photoInput = { sellerId: 'demo-seller', clientPhotoId: 'test-photo', mimeType: 'image/png', base64: 'iVBORw0KGgo=' };
    const photo1 = await call('/api/listing-photos', 'POST', photoInput);
    const photo2 = await call('/api/listing-photos', 'POST', photoInput);
    assert.equal(photo1.data.photoId, photo2.data.photoId);
    const listingInput = { sellerId: 'demo-seller', clientDraftId: 'test-draft', photoId: photo1.data.photoId, title: 'Bell metal craft', category: 'handicraft', quantity: 2, unit: 'piece', unitPriceRupees: 500, estimatedWeightKgPerUnit: 1, packageLengthCmPerUnit: 20, packageWidthCmPerUnit: 20, packageHeightCmPerUnit: 20 };
    const listing1 = await call('/api/listings', 'POST', listingInput);
    const listing2 = await call('/api/listings', 'POST', listingInput);
    assert.equal(listing1.data.id, listing2.data.id);
    const order = () => call('/api/requests', 'POST', { listingId: listing1.data.id, buyerName: 'Demo buyer', buyerPhone: '+910000000001', quantity: 1 });
    const r1 = await order();
    await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'withdraw' });
    const lateAccept = await call(`/api/requests/${r1.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 });
    assert.equal(lateAccept.status, 409);
    const r2 = await order();
    const accepted = await call(`/api/requests/${r2.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 });
    assert.equal(accepted.data.status, 'accepted');
    const duplicate = await call(`/api/requests/${r2.data.id}/status`, 'PATCH', { action: 'accept', exactQuantity: 1, unitPriceRupees: 500, totalPriceRupees: 500 });
    assert.equal(duplicate.status, 409);
    const listingAfter = await call(`/api/listings/${listing1.data.id}`, 'GET');
    assert.equal(listingAfter.data.availableQuantity, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('customer and seller accounts validate details and can log in again', async () => {
  const testDirectory = await mkdtemp(join(tmpdir(), 'minor-project-auth-'));
  process.env.AUTH_DATA_FILE = join(testDirectory, 'users.json');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (path, payload) => {
    if (path === '/api/auth/register') payload = { firstName: 'अनिता', lastName: 'Kumar', ...payload };
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
    const seller = await call('/api/auth/register', { role: 'seller', email: 'seller@example.com', phone: '9876543210', password: 'password1' });
    assert.equal(seller.status, 201);
    assert.equal(seller.data.account.phone, '+919876543210');
    for (const identifier of ['seller@example.com', '9876543210', '+91 9876543210']) {
      const sellerLogin = await call('/api/auth/login', { role: 'seller', identifier, password: 'password1' });
      assert.equal(sellerLogin.status, 200);
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
    await new Promise(resolve => server.close(resolve));
    delete process.env.AUTH_DATA_FILE;
    await rm(testDirectory, { recursive: true, force: true });
  }
});
