CREATE TABLE IF NOT EXISTS listing_photos (
  id UUID PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_photo_id TEXT NOT NULL
    CHECK (char_length(btrim(client_photo_id)) > 0),
  mime_type TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_data BYTEA NOT NULL
    CHECK (octet_length(image_data) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT listing_photos_seller_client_photo_unique
    UNIQUE (seller_id, client_photo_id),
  CONSTRAINT listing_photos_seller_id_unique
    UNIQUE (seller_id, id)
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_draft_id TEXT NOT NULL
    CHECK (char_length(btrim(client_draft_id)) > 0),
  title TEXT NOT NULL
    CHECK (char_length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL
    CHECK (char_length(btrim(category)) > 0),
  unit_price_rupees NUMERIC(14, 2) NOT NULL
    CHECK (unit_price_rupees >= 0),
  quantity NUMERIC(14, 3) NOT NULL
    CHECK (quantity > 0),
  available_quantity NUMERIC(14, 3) NOT NULL
    CHECK (available_quantity >= 0 AND available_quantity <= quantity),
  unit TEXT NOT NULL
    CHECK (unit IN ('kg', 'piece')),
  estimated_weight_kg_per_unit NUMERIC(14, 3) NOT NULL
    CHECK (estimated_weight_kg_per_unit > 0),
  package_length_cm_per_unit NUMERIC(14, 2) NOT NULL
    CHECK (package_length_cm_per_unit > 0),
  package_width_cm_per_unit NUMERIC(14, 2) NOT NULL
    CHECK (package_width_cm_per_unit > 0),
  package_height_cm_per_unit NUMERIC(14, 2) NOT NULL
    CHECK (package_height_cm_per_unit > 0),
  village TEXT NOT NULL,
  pickup_location JSONB NOT NULL,
  photo_id UUID,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT listings_seller_draft_unique
    UNIQUE (seller_id, client_draft_id),
  CONSTRAINT listings_id_seller_unique
    UNIQUE (id, seller_id),
  CONSTRAINT listings_photo_owner_fk
    FOREIGN KEY (seller_id, photo_id)
    REFERENCES listing_photos(seller_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS listings_status_created_idx
  ON listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_seller_created_idx
  ON listings (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  listing_id UUID NOT NULL,
  product_name_snapshot TEXT NOT NULL
    CHECK (char_length(btrim(product_name_snapshot)) > 0),
  requested_unit_price_rupees NUMERIC(14, 2) NOT NULL
    CHECK (requested_unit_price_rupees >= 0),
  requested_quantity NUMERIC(14, 3) NOT NULL
    CHECK (requested_quantity > 0),
  unit TEXT NOT NULL
    CHECK (unit IN ('kg', 'piece')),
  buyer_name_snapshot TEXT NOT NULL
    CHECK (char_length(btrim(buyer_name_snapshot)) > 0),
  buyer_phone_snapshot TEXT NOT NULL
    CHECK (char_length(btrim(buyer_phone_snapshot)) > 0),
  seller_phone_snapshot TEXT NOT NULL
    CHECK (char_length(btrim(seller_phone_snapshot)) > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  accepted_quantity NUMERIC(14, 3),
  accepted_unit_price_rupees NUMERIC(14, 2),
  accepted_total_price_rupees NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT requests_listing_seller_fk
    FOREIGN KEY (listing_id, seller_id)
    REFERENCES listings(id, seller_id) ON DELETE RESTRICT,
  CONSTRAINT requests_accepted_terms_consistent
    CHECK (
      (
        status = 'accepted'
        AND accepted_quantity IS NOT NULL
        AND accepted_quantity > 0
        AND accepted_unit_price_rupees IS NOT NULL
        AND accepted_unit_price_rupees >= 0
        AND accepted_total_price_rupees IS NOT NULL
        AND accepted_total_price_rupees >= 0
      )
      OR
      (
        status <> 'accepted'
        AND accepted_quantity IS NULL
        AND accepted_unit_price_rupees IS NULL
        AND accepted_total_price_rupees IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS requests_buyer_created_idx
  ON requests (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_seller_created_idx
  ON requests (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_listing_idx
  ON requests (listing_id);
CREATE INDEX IF NOT EXISTS requests_pending_seller_created_idx
  ON requests (seller_id, created_at DESC)
  WHERE status = 'pending';
