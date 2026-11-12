CREATE TABLE listing_gallery (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  photo_id UUID NOT NULL REFERENCES listing_photos(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  source_url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '',
  license_url TEXT NOT NULL DEFAULT '',
  illustrative BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (listing_id, position),
  UNIQUE (listing_id, photo_id)
);
