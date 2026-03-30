-- Optional display name for greeting in header (e.g. "Hi, Jane")
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN users.display_name IS 'User-set display name for greeting; null means show profile prompt';
