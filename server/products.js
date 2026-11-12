import { databasePool, withDatabaseTransaction } from './db.js';

export async function getProductSummaries(ids) {
  if (!ids.length) return [];
  const result = await databasePool().query(`
    SELECT l.id::text AS id,
      COALESCE(NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Seller') AS "sellerName",
      (SELECT AVG(r.rating)::float FROM product_reviews r WHERE r.listing_id = l.id) AS "averageRating",
      (SELECT COUNT(*)::int FROM product_reviews r WHERE r.listing_id = l.id) AS "reviewCount",
      COALESCE((SELECT SUM(o.accepted_quantity)::float FROM requests o
        WHERE o.listing_id = l.id AND o.status = 'completed'), 0) AS "unitsSold",
      (SELECT COALESCE(json_agg('/api/photos/' || g.photo_id ORDER BY g.position), '[]'::json)
        FROM listing_gallery g WHERE g.listing_id = l.id) AS "imageUrls",
      (SELECT COALESCE(json_agg(json_build_object('sourceUrl', g.source_url, 'author', g.author,
        'license', g.license, 'licenseUrl', g.license_url, 'illustrative', g.illustrative) ORDER BY g.position), '[]'::json)
        FROM listing_gallery g WHERE g.listing_id = l.id) AS "imageCredits"
    FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.id = ANY($1::uuid[])`, [ids]);
  return result.rows;
}

export async function getProductReviews(listingId) {
  const result = await databasePool().query(`
    SELECT r.id::text, r.rating, r.body, r.created_at AS "createdAt",
      COALESCE(NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Buyer') AS "buyerName",
      COALESCE((SELECT json_agg('/api/review-images/' || i.id ORDER BY i.position)
        FROM product_review_images i WHERE i.review_id = r.id), '[]'::json) AS "imageUrls"
    FROM product_reviews r JOIN users u ON u.id = r.buyer_id
    WHERE r.listing_id = $1 ORDER BY r.created_at DESC LIMIT 100`, [listingId]);
  return result.rows;
}

export async function getReviewEligibility(listingId, buyerId) {
  const result = await databasePool().query(`SELECT
    EXISTS(SELECT 1 FROM requests WHERE listing_id = $1 AND buyer_id = $2 AND status = 'completed') AS purchased,
    EXISTS(SELECT 1 FROM product_reviews WHERE listing_id = $1 AND buyer_id = $2) AS reviewed`, [listingId, buyerId]);
  return result.rows[0];
}

export async function createProductReview(review) {
  return withDatabaseTransaction(async client => {
    // Recheck eligibility inside the write transaction; identity comes from the bearer session.
    const purchase = await client.query(`SELECT id FROM requests
      WHERE listing_id = $1 AND buyer_id = $2 AND status = 'completed' LIMIT 1`, [review.listingId, review.buyerId]);
    if (!purchase.rowCount) { const error = new Error('Purchase required'); error.code = 'PURCHASE_REQUIRED'; throw error; }
    await client.query(`INSERT INTO product_reviews (id, listing_id, buyer_id, rating, body)
      VALUES ($1, $2, $3, $4, $5)`, [review.id, review.listingId, review.buyerId, review.rating, review.body]);
    for (const [position, image] of review.images.entries()) {
      await client.query(`INSERT INTO product_review_images (id, review_id, position, mime_type, image_data)
        VALUES ($1, $2, $3, $4, $5)`, [image.id, review.id, position, image.mimeType, image.bytes]);
    }
  });
}

export async function findReviewImage(id) {
  const result = await databasePool().query('SELECT mime_type AS "mimeType", image_data AS "imageData" FROM product_review_images WHERE id = $1', [id]);
  return result.rows[0];
}
