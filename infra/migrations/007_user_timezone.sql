ALTER TABLE users
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN users.timezone IS 'IANA timezone identifier used for relative date/time mapping.';
