-- Add extra metadata for audio notes
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS archive_url TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds REAL,
ADD COLUMN IF NOT EXISTS waveform_json JSONB;

