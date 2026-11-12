import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { databasePool, closeDatabasePool, createListingPhoto, createListing, createBuyerRequest, acceptRequestAndDecrementStock, updateRequestStatus } from './db.js';
import { getProductSummaries, getProductReviews, getReviewEligibility, createProductReview, findReviewImage } from './products.js';
import { createServer } from './index.js';

// Opt in explicitly. All writes are confined to a fresh schema, removed in finally.
test('PostgreSQL migrations, concurrent stock acceptance, completion and review transactions', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async () => {
  const schema = 'product_test_' + randomUUID().replaceAll('-', '');
  const previousOptions = process.env.PGOPTIONS;
  let schemaCreated = false;
  let api;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false, max: 1 });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const db = databasePool();
    assert.equal((await db.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    const migrations = (await readdir(new URL('./migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      if (name === '006_restore_first_name.sql') {
        await db.query('ALTER TABLE users RENAME COLUMN first_name TO "Prajwal"');
        await db.query(`INSERT INTO users (id, role, email, password_salt, password_hash, "Prajwal", last_name)
          VALUES ($1, 'customer', 'schema-repair@example.invalid', 'test', 'test', 'Preserved', 'Name')`, [randomUUID()]);
      }
      await db.query(await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8'));
      if (name === '006_restore_first_name.sql') {
        assert.equal((await db.query("SELECT first_name FROM users WHERE email = 'schema-repair@example.invalid'")).rows[0].first_name, 'Preserved');
        // The repair is also safe on an already-correct schema.
        await db.query(await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8'));
      }
    }
    // Exercise the real auth queries and session store after the schema repair.
    api = createServer();
    await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
    const apiBase = `http://127.0.0.1:${api.address().port}`;
    const credentials = { role: 'customer', email: 'login-regression@example.invalid', password: 'test-password-123' };
    const registerResponse = await fetch(apiBase + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, firstName: 'Login', lastName: 'Regression' }) });
    assert.equal(registerResponse.status, 201);
    await registerResponse.json();
    const loginResponse = await fetch(apiBase + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: credentials.role, identifier: credentials.email, password: credentials.password }) });
    assert.equal(loginResponse.status, 200);
    const loginSession = await loginResponse.json();
    assert.equal(loginSession.account.firstName, 'Login');
    const ownedRequests = await fetch(apiBase + '/api/buyers/me/requests', { headers: { Authorization: `Bearer ${loginSession.token}` } });
    assert.equal(ownedRequests.status, 200);
    assert.deepEqual((await ownedRequests.json()).requests, []);
    const sellerId = randomUUID(), buyerId = randomUUID(), otherBuyerId = randomUUID();
    for (const [id, role, first] of [[sellerId, 'seller', 'Artisan'], [buyerId, 'customer', 'Buyer'], [otherBuyerId, 'customer', 'Other']]) {
      await db.query(`INSERT INTO users (id, role, email, phone, password_salt, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, 'test', 'test', $5, 'Test')`, [id, role, `${id}@example.com`, role === 'seller' ? '+919876543210' : null, first]);
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=', 'base64');
    const photo = await createListingPhoto({ id: randomUUID(), sellerId, clientPhotoId: 'photo', mimeType: 'image/png', imageData: png });
    const listing = await createListing({ id: randomUUID(), sellerId, clientDraftId: 'draft', title: 'Handmade bowl', description: '', category: 'handicraft', quantity: 4, unit: 'piece', unitPriceRupees: 250, estimatedWeightKgPerUnit: 1, packageLengthCmPerUnit: 10, packageWidthCmPerUnit: 10, packageHeightCmPerUnit: 10, village: 'Kondagaon', pickupLocation: { lat: 19.59, lng: 81.66 }, photoId: photo.id });
    const alternatePhoto = await createListingPhoto({ id: randomUUID(), sellerId, clientPhotoId: 'alternate-photo', mimeType: 'image/png', imageData: png });
    await db.query(`INSERT INTO listing_gallery (listing_id, photo_id, position, source_url, author, license, illustrative)
      VALUES ($1, $2, 0, 'https://commons.wikimedia.org/example', 'Test photographer', 'CC0', TRUE),
             ($1, $3, 1, 'https://commons.wikimedia.org/another-example', 'Another photographer', 'CC BY 4.0', TRUE)`, [listing.id, photo.id, alternatePhoto.id]);
    const gallery = (await getProductSummaries([listing.id]))[0];
    assert.deepEqual(gallery.imageUrls, [`/api/photos/${photo.id}`, `/api/photos/${alternatePhoto.id}`]);
    assert.equal(gallery.imageCredits[1].author, 'Another photographer');
    assert.equal(gallery.imageCredits[0].illustrative, true);
    const order = async (buyer, quantity) => createBuyerRequest({ id: randomUUID(), listingId: listing.id, sellerId, buyerId: buyer, productName: listing.title, buyerName: 'Buyer Test', buyerPhone: '+919876543211', sellerPhone: '+919876543210', quantity, unit: 'piece', requestedUnitPriceRupees: 250 });
    const orders = await Promise.all([order(buyerId, 3), order(buyerId, 3)]);
    const attempts = await Promise.allSettled(orders.map(request => acceptRequestAndDecrementStock({ requestId: request.id, sellerId, acceptedQuantity: 3, acceptedUnitPriceRupees: 250, acceptedTotalPriceRupees: 750 })));
    assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(item => item.status === 'rejected')[0].reason.code, 'STOCK_UNAVAILABLE');
    assert.deepEqual(await getReviewEligibility(listing.id, buyerId), { purchased: false, reviewed: false });
    assert.equal((await getProductSummaries([listing.id]))[0].unitsSold, 0);
    const accepted = attempts.find(item => item.status === 'fulfilled').value;
    const complete = async request => updateRequestStatus(request.id, { status: 'completed', expectedStatus: 'accepted', buyerId: request.buyerId, acceptedQuantity: request.acceptedQuantity, acceptedUnitPriceRupees: request.acceptedUnitPriceRupees, acceptedTotalPriceRupees: request.acceptedTotalPriceRupees });
    assert.equal((await complete(accepted)).status, 'completed');
    assert.equal((await getProductSummaries([listing.id]))[0].unitsSold, 3);
    assert.equal(await complete(accepted), null);
    const review = { id: randomUUID(), listingId: listing.id, buyerId, rating: 4, body: 'Good quality', images: [{ id: randomUUID(), mimeType: 'image/png', bytes: png }] };
    await assert.rejects(createProductReview({ ...review, buyerId: otherBuyerId }), { code: 'PURCHASE_REQUIRED' });
    await createProductReview(review);
    await assert.rejects(createProductReview({ ...review, id: randomUUID() }), { code: '23505' });
    assert.equal((await getProductReviews(listing.id))[0].buyerName, 'Buyer Test');
    assert.deepEqual((await findReviewImage(review.images[0].id)).imageData, png);
    const otherOrder = await order(otherBuyerId, 1);
    const otherAccepted = await acceptRequestAndDecrementStock({ requestId: otherOrder.id, sellerId, acceptedQuantity: 1, acceptedUnitPriceRupees: 250, acceptedTotalPriceRupees: 250 });
    await complete(otherAccepted);
    await assert.rejects(createProductReview({ ...review, id: randomUUID(), buyerId: otherBuyerId, images: [{ id: randomUUID(), mimeType: 'image/png', bytes: Buffer.alloc(0) }] }), { code: '23514' });
    assert.equal((await getReviewEligibility(listing.id, otherBuyerId)).reviewed, false, 'image failure must roll back the review');
    await createProductReview({ ...review, id: randomUUID(), buyerId: otherBuyerId, rating: 2, images: [] });
    const summary = (await getProductSummaries([listing.id]))[0];
    assert.equal(summary.averageRating, 3);
    assert.equal(summary.reviewCount, 2);
    assert.equal(summary.unitsSold, 4);
    assert.equal(summary.sellerName, 'Artisan Test');
  } finally {
    if (api) await new Promise(resolve => api.close(resolve));
    await closeDatabasePool();
    if (previousOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previousOptions;
    if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
