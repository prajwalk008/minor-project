ALTER TABLE requests DROP CONSTRAINT requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check
  CHECK (status IN ('pending', 'accepted', 'completed', 'declined', 'withdrawn'));
ALTER TABLE requests DROP CONSTRAINT requests_accepted_terms_consistent;
ALTER TABLE requests ADD CONSTRAINT requests_accepted_terms_consistent CHECK (
  (status IN ('accepted', 'completed') AND accepted_quantity > 0
    AND accepted_quantity IS NOT NULL AND accepted_unit_price_rupees >= 0
    AND accepted_unit_price_rupees IS NOT NULL AND accepted_total_price_rupees >= 0
    AND accepted_total_price_rupees IS NOT NULL)
  OR (status NOT IN ('accepted', 'completed') AND accepted_quantity IS NULL
    AND accepted_unit_price_rupees IS NULL AND accepted_total_price_rupees IS NULL)
);

CREATE TABLE product_reviews (
  id UUID PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX product_reviews_listing_created_idx ON product_reviews(listing_id, created_at DESC);
CREATE TABLE product_review_images (
  id UUID PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 2),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_data BYTEA NOT NULL CHECK (octet_length(image_data) BETWEEN 1 AND 1000000),
  UNIQUE (review_id, position)
);
