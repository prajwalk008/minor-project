-- Preserve existing accounts; new registrations supply both names through the API.
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD CONSTRAINT users_first_name_length
  CHECK (first_name IS NULL OR char_length(btrim(first_name)) BETWEEN 1 AND 100);
ALTER TABLE users ADD CONSTRAINT users_last_name_length
  CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 100);
