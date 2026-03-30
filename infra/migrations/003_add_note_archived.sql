-- Add archived flag to notes so we can hide archived items on Home
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notes_user_bucket_archived_created_at
  ON notes(user_id, bucket_id, archived, created_at DESC);

