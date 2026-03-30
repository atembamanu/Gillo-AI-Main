-- Add audio support columns to notes for audio insights
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

