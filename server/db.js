import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });

let pool;

export function usesFileAuthStore() {
  return Boolean(process.env.AUTH_DATA_FILE);
}

export function databasePool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when AUTH_DATA_FILE is not set');
  }
  if (!pool) {
   pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
});
  }
  return pool;
}

export async function closeDatabasePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function createSessionRecord(session) {
  await databasePool().query(
    'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt],
  );
}

export async function findSessionByTokenHash(tokenHash) {
  const result = await databasePool().query(
    'SELECT id::text AS id, user_id::text AS "userId", expires_at AS "expiresAt", revoked_at AS "revokedAt" FROM sessions WHERE token_hash = $1',
    [tokenHash],
  );
  return result.rows[0];
}

export async function revokeSessionById(id) {
  const result = await databasePool().query(
    'UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
    [id],
  );
  return result.rowCount > 0;
}

function numericValue(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`Invalid numeric value returned for ${field}`);
  }
  return number;
}

function dateValue(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid timestamp returned for ${field}`);
  }
  return date.toISOString();
}

function mapListing(row) {
  if (!row) return null;
  return {
    id: row.id,
    sellerId: row.sellerId,
    clientDraftId: row.clientDraftId,
    title: row.title,
    category: row.category,
    description: row.description,
    quantity: numericValue(row.quantity, 'listings.quantity'),
    availableQuantity: numericValue(row.availableQuantity, 'listings.available_quantity'),
    unit: row.unit,
    unitPriceRupees: numericValue(row.unitPriceRupees, 'listings.unit_price_rupees'),
    estimatedWeightKgPerUnit: numericValue(row.estimatedWeightKgPerUnit, 'listings.estimated_weight_kg_per_unit'),
    packageLengthCmPerUnit: numericValue(row.packageLengthCmPerUnit, 'listings.package_length_cm_per_unit'),
    packageWidthCmPerUnit: numericValue(row.packageWidthCmPerUnit, 'listings.package_width_cm_per_unit'),
    packageHeightCmPerUnit: numericValue(row.packageHeightCmPerUnit, 'listings.package_height_cm_per_unit'),
    village: row.village,
    pickupLocation: row.pickupLocation,
    photoId: row.photoId,
    status: row.status,
    createdAt: dateValue(row.createdAt, 'listings.created_at'),
    updatedAt: dateValue(row.updatedAt, 'listings.updated_at'),
  };
}

function mapListingPhoto(row) {
  if (!row) return null;
  return {
    id: row.id,
    sellerId: row.sellerId,
    clientPhotoId: row.clientPhotoId,
    mimeType: row.mimeType,
    imageData: row.imageData,
    createdAt: dateValue(row.createdAt, 'listing_photos.created_at'),
  };
}

function mapRequest(row) {
  if (!row) return null;
  const request = {
    id: row.id,
    listingId: row.listingId,
    sellerId: row.sellerId,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    sellerPhone: row.sellerPhone,
    productName: row.productName,
    quantity: numericValue(row.quantity, 'requests.requested_quantity'),
    unit: row.unit,
    requestedUnitPriceRupees: numericValue(row.requestedUnitPriceRupees, 'requests.requested_unit_price_rupees'),
    status: row.status,
    createdAt: dateValue(row.createdAt, 'requests.created_at'),
    updatedAt: dateValue(row.updatedAt, 'requests.updated_at'),
  };
  if (row.acceptedQuantity !== null) {
    request.acceptedQuantity = numericValue(row.acceptedQuantity, 'requests.accepted_quantity');
  }
  if (row.acceptedUnitPriceRupees !== null) {
    request.acceptedUnitPriceRupees = numericValue(row.acceptedUnitPriceRupees, 'requests.accepted_unit_price_rupees');
  }
  if (row.acceptedTotalPriceRupees !== null) {
    request.acceptedTotalPriceRupees = numericValue(row.acceptedTotalPriceRupees, 'requests.accepted_total_price_rupees');
  }
  return request;
}

const LISTING_SELECT = `
  SELECT id::text AS id, seller_id::text AS "sellerId",
    client_draft_id AS "clientDraftId", title, category, description,
    quantity, available_quantity AS "availableQuantity", unit,
    unit_price_rupees AS "unitPriceRupees",
    estimated_weight_kg_per_unit AS "estimatedWeightKgPerUnit",
    package_length_cm_per_unit AS "packageLengthCmPerUnit",
    package_width_cm_per_unit AS "packageWidthCmPerUnit",
    package_height_cm_per_unit AS "packageHeightCmPerUnit",
    village, pickup_location AS "pickupLocation", photo_id::text AS "photoId",
    status, created_at AS "createdAt", updated_at AS "updatedAt"
  FROM listings`;

const PHOTO_SELECT = `
  SELECT id::text AS id, seller_id::text AS "sellerId",
    client_photo_id AS "clientPhotoId", mime_type AS "mimeType",
    image_data AS "imageData", created_at AS "createdAt"
  FROM listing_photos`;

const REQUEST_SELECT = `
  SELECT id::text AS id, listing_id::text AS "listingId",
    seller_id::text AS "sellerId", buyer_id::text AS "buyerId",
    buyer_name_snapshot AS "buyerName",
    buyer_phone_snapshot AS "buyerPhone",
    seller_phone_snapshot AS "sellerPhone",
    product_name_snapshot AS "productName",
    requested_quantity AS quantity, unit,
    requested_unit_price_rupees AS "requestedUnitPriceRupees",
    status, accepted_quantity AS "acceptedQuantity",
    accepted_unit_price_rupees AS "acceptedUnitPriceRupees",
    accepted_total_price_rupees AS "acceptedTotalPriceRupees",
    created_at AS "createdAt", updated_at AS "updatedAt"
  FROM requests`;

export async function withDatabaseTransaction(operation) {
  if (typeof operation !== 'function') {
    throw new TypeError('A transaction operation is required');
  }
  const client = await databasePool().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function createListingPhoto(photo, queryable = databasePool()) {
  const result = await queryable.query(
    `INSERT INTO listing_photos
      (id, seller_id, client_photo_id, mime_type, image_data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (seller_id, client_photo_id)
     DO UPDATE SET client_photo_id = EXCLUDED.client_photo_id
     RETURNING id::text AS id, seller_id::text AS "sellerId",
       client_photo_id AS "clientPhotoId", mime_type AS "mimeType",
       image_data AS "imageData", created_at AS "createdAt"`,
    [photo.id, photo.sellerId, photo.clientPhotoId, photo.mimeType, photo.imageData],
  );
  return mapListingPhoto(result.rows[0]);
}

export async function findListingPhotoById(id, queryable = databasePool()) {
  const result = await queryable.query(`${PHOTO_SELECT} WHERE id = $1`, [id]);
  return mapListingPhoto(result.rows[0]);
}

export async function findListingPhotoByClientId(sellerId, clientPhotoId, queryable = databasePool()) {
  const result = await queryable.query(
    `${PHOTO_SELECT} WHERE seller_id = $1 AND client_photo_id = $2`,
    [sellerId, clientPhotoId],
  );
  return mapListingPhoto(result.rows[0]);
}

export async function createListing(listing, queryable = databasePool()) {
  const result = await queryable.query(
    `INSERT INTO listings
      (id, seller_id, client_draft_id, title, description, category,
       unit_price_rupees, quantity, available_quantity, unit,
       estimated_weight_kg_per_unit, package_length_cm_per_unit,
       package_width_cm_per_unit, package_height_cm_per_unit, village,
       pickup_location, photo_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18)
     ON CONFLICT (seller_id, client_draft_id)
     DO UPDATE SET client_draft_id = EXCLUDED.client_draft_id
     RETURNING id::text AS id, seller_id::text AS "sellerId",
       client_draft_id AS "clientDraftId", title, category, description,
       quantity, available_quantity AS "availableQuantity", unit,
       unit_price_rupees AS "unitPriceRupees",
       estimated_weight_kg_per_unit AS "estimatedWeightKgPerUnit",
       package_length_cm_per_unit AS "packageLengthCmPerUnit",
       package_width_cm_per_unit AS "packageWidthCmPerUnit",
       package_height_cm_per_unit AS "packageHeightCmPerUnit",
       village, pickup_location AS "pickupLocation", photo_id::text AS "photoId",
       status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      listing.id, listing.sellerId, listing.clientDraftId, listing.title,
      listing.description ?? '', listing.category, listing.unitPriceRupees,
      listing.quantity, listing.availableQuantity ?? listing.quantity, listing.unit,
      listing.estimatedWeightKgPerUnit, listing.packageLengthCmPerUnit,
      listing.packageWidthCmPerUnit, listing.packageHeightCmPerUnit,
      listing.village, JSON.stringify(listing.pickupLocation),
      listing.photoId ?? null, listing.status ?? 'active',
    ],
  );
  return mapListing(result.rows[0]);
}

export async function findListingById(id, queryable = databasePool()) {
  const result = await queryable.query(`${LISTING_SELECT} WHERE id = $1`, [id]);
  return mapListing(result.rows[0]);
}

export async function findActiveListings(search = '', queryable = databasePool()) {
  const result = await queryable.query(
    `${LISTING_SELECT}
     WHERE status = 'active'
       AND ($1::text = '' OR strpos(lower(title), lower($1)) > 0)
     ORDER BY created_at DESC`,
    [search],
  );
  return result.rows.map(mapListing);
}

export async function findListingsBySeller(sellerId, queryable = databasePool()) {
  const result = await queryable.query(
    `${LISTING_SELECT} WHERE seller_id = $1 ORDER BY created_at DESC`,
    [sellerId],
  );
  return result.rows.map(mapListing);
}

export async function updateListingAvailableStock(listingId, quantityDelta, queryable = databasePool()) {
  if (typeof quantityDelta !== 'number' || !Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new TypeError('Stock change must be a non-zero finite number');
  }
  const result = await queryable.query(
    `UPDATE listings
     SET available_quantity = available_quantity + $2, updated_at = NOW()
     WHERE id = $1
       AND available_quantity + $2 >= 0
       AND available_quantity + $2 <= quantity
     RETURNING id::text AS id, seller_id::text AS "sellerId",
       client_draft_id AS "clientDraftId", title, category, description,
       quantity, available_quantity AS "availableQuantity", unit,
       unit_price_rupees AS "unitPriceRupees",
       estimated_weight_kg_per_unit AS "estimatedWeightKgPerUnit",
       package_length_cm_per_unit AS "packageLengthCmPerUnit",
       package_width_cm_per_unit AS "packageWidthCmPerUnit",
       package_height_cm_per_unit AS "packageHeightCmPerUnit",
       village, pickup_location AS "pickupLocation", photo_id::text AS "photoId",
       status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [listingId, quantityDelta],
  );
  return mapListing(result.rows[0]);
}

export async function createBuyerRequest(request, queryable = databasePool()) {
  const result = await queryable.query(
    `INSERT INTO requests
      (id, buyer_id, seller_id, listing_id, product_name_snapshot,
       requested_unit_price_rupees, requested_quantity, unit,
       buyer_name_snapshot, buyer_phone_snapshot, seller_phone_snapshot,
       status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       COALESCE($13::timestamptz, NOW()), COALESCE($14::timestamptz, NOW()))
     RETURNING id::text AS id, listing_id::text AS "listingId",
       seller_id::text AS "sellerId", buyer_id::text AS "buyerId",
       buyer_name_snapshot AS "buyerName",
       buyer_phone_snapshot AS "buyerPhone",
       seller_phone_snapshot AS "sellerPhone",
       product_name_snapshot AS "productName",
       requested_quantity AS quantity, unit,
       requested_unit_price_rupees AS "requestedUnitPriceRupees",
       status, accepted_quantity AS "acceptedQuantity",
       accepted_unit_price_rupees AS "acceptedUnitPriceRupees",
       accepted_total_price_rupees AS "acceptedTotalPriceRupees",
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      request.id, request.buyerId, request.sellerId, request.listingId,
      request.productName, request.requestedUnitPriceRupees, request.quantity,
      request.unit, request.buyerName, request.buyerPhone, request.sellerPhone,
      request.status ?? 'pending', request.createdAt ?? null, request.updatedAt ?? null,
    ],
  );
  return mapRequest(result.rows[0]);
}

export async function findRequestById(id, queryable = databasePool()) {
  const result = await queryable.query(`${REQUEST_SELECT} WHERE id = $1`, [id]);
  return mapRequest(result.rows[0]);
}

export async function findRequestsBySeller(sellerId, queryable = databasePool()) {
  const result = await queryable.query(
    `${REQUEST_SELECT} WHERE seller_id = $1 ORDER BY created_at DESC`,
    [sellerId],
  );
  return result.rows.map(mapRequest);
}

export async function findRequestsByBuyer(buyerId, queryable = databasePool()) {
  const result = await queryable.query(
    `${REQUEST_SELECT} WHERE buyer_id = $1 ORDER BY created_at DESC`,
    [buyerId],
  );
  return result.rows.map(mapRequest);
}

export async function updateRequestStatus(id, update, queryable = databasePool()) {
  const result = await queryable.query(
    `UPDATE requests
     SET status = $2,
       accepted_quantity = $3,
       accepted_unit_price_rupees = $4,
       accepted_total_price_rupees = $5,
       updated_at = NOW()
     WHERE id = $1
       AND ($6::text IS NULL OR status = $6)
       AND ($7::uuid IS NULL OR seller_id = $7)
       AND ($8::uuid IS NULL OR buyer_id = $8)
     RETURNING id::text AS id, listing_id::text AS "listingId",
       seller_id::text AS "sellerId", buyer_id::text AS "buyerId",
       buyer_name_snapshot AS "buyerName",
       buyer_phone_snapshot AS "buyerPhone",
       seller_phone_snapshot AS "sellerPhone",
       product_name_snapshot AS "productName",
       requested_quantity AS quantity, unit,
       requested_unit_price_rupees AS "requestedUnitPriceRupees",
       status, accepted_quantity AS "acceptedQuantity",
       accepted_unit_price_rupees AS "acceptedUnitPriceRupees",
       accepted_total_price_rupees AS "acceptedTotalPriceRupees",
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      id, update.status, update.acceptedQuantity ?? null,
      update.acceptedUnitPriceRupees ?? null,
      update.acceptedTotalPriceRupees ?? null,
      update.expectedStatus ?? null, update.sellerId ?? null, update.buyerId ?? null,
    ],
  );
  return mapRequest(result.rows[0]);
}

export async function acceptRequestAndDecrementStock({
  requestId,
  sellerId,
  acceptedQuantity,
  acceptedUnitPriceRupees,
  acceptedTotalPriceRupees,
}) {
  return withDatabaseTransaction(async client => {
    const requestResult = await client.query(
      `${REQUEST_SELECT}
       WHERE id = $1 AND seller_id = $2
       FOR UPDATE`,
      [requestId, sellerId],
    );
    const request = mapRequest(requestResult.rows[0]);
    if (!request) return null;
    if (request.status !== 'pending') {
      const error = new Error('Request is no longer pending');
      error.code = 'REQUEST_NOT_PENDING';
      throw error;
    }
    if (acceptedQuantity !== request.quantity ||
        acceptedUnitPriceRupees !== request.requestedUnitPriceRupees ||
        !Number.isFinite(acceptedTotalPriceRupees) ||
        Math.abs(acceptedQuantity * acceptedUnitPriceRupees - acceptedTotalPriceRupees) > 0.01) {
      const error = new Error('Accepted terms do not match the pending request');
      error.code = 'INVALID_ACCEPTED_TERMS';
      throw error;
    }

    const stockResult = await client.query(
      `UPDATE listings
       SET available_quantity = available_quantity - $2, updated_at = NOW()
       WHERE id = $1 AND status = 'active' AND available_quantity >= $2
       RETURNING id`,
      [request.listingId, acceptedQuantity],
    );
    if (stockResult.rowCount !== 1) {
      const error = new Error('Not enough active listing stock');
      error.code = 'STOCK_UNAVAILABLE';
      throw error;
    }

    const updateResult = await client.query(
      `UPDATE requests
       SET status = 'accepted', accepted_quantity = $2,
         accepted_unit_price_rupees = $3,
         accepted_total_price_rupees = $4, updated_at = NOW()
       WHERE id = $1 AND seller_id = $5 AND status = 'pending'
       RETURNING id::text AS id, listing_id::text AS "listingId",
         seller_id::text AS "sellerId", buyer_id::text AS "buyerId",
         buyer_name_snapshot AS "buyerName",
         buyer_phone_snapshot AS "buyerPhone",
         seller_phone_snapshot AS "sellerPhone",
         product_name_snapshot AS "productName",
         requested_quantity AS quantity, unit,
         requested_unit_price_rupees AS "requestedUnitPriceRupees",
         status, accepted_quantity AS "acceptedQuantity",
         accepted_unit_price_rupees AS "acceptedUnitPriceRupees",
         accepted_total_price_rupees AS "acceptedTotalPriceRupees",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [requestId, acceptedQuantity, acceptedUnitPriceRupees, acceptedTotalPriceRupees, sellerId],
    );
    if (updateResult.rowCount !== 1) {
      const error = new Error('Request could not be accepted');
      error.code = 'REQUEST_NOT_PENDING';
      throw error;
    }
    return mapRequest(updateResult.rows[0]);
  });
}
