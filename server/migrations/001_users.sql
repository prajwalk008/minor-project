CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('seller', 'customer')),
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seller_phone_required CHECK (role <> 'seller' OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS users_role_email_idx ON users (role, email);
