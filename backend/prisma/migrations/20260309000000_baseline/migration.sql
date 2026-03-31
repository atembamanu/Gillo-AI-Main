-- Baseline migration reflecting the current production schema.
-- Existing deployments using infra/migrations/*.sql should mark this as applied.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buckets_user_id ON buckets(user_id);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket_id UUID NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  structured_json JSONB,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT,
  audio_url TEXT,
  archive_url TEXT,
  duration_seconds REAL,
  waveform_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_user_bucket_created_at
  ON notes(user_id, bucket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_bucket_archived_created_at
  ON notes(user_id, bucket_id, archived, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket_id UUID NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  input_text TEXT NOT NULL,
  llm_output JSONB,
  corrected_output JSONB,
  corrected_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_bucket_created_at
  ON ai_interactions(user_id, bucket_id, created_at DESC);
