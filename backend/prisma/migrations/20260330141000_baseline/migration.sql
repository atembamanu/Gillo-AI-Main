-- Prisma baseline migration for existing Gillo schema.
-- Safe strategy:
-- 1) New environments: prisma migrate deploy applies this file.
-- 2) Existing environments: mark this migration as applied via
--    `prisma migrate resolve --applied 20260330141000_baseline`.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "display_name" TEXT,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "buckets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "buckets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_buckets_user_id" ON "buckets"("user_id");

CREATE TABLE IF NOT EXISTS "notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "bucket_id" UUID NOT NULL,
  "original_text" TEXT NOT NULL,
  "structured_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "category" TEXT,
  "audio_url" TEXT,
  "archive_url" TEXT,
  "duration_seconds" REAL,
  "waveform_json" JSONB,

  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_notes_user_bucket_created_at"
  ON "notes"("user_id", "bucket_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_notes_user_bucket_archived_created_at"
  ON "notes"("user_id", "bucket_id", "archived", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "ai_interactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "bucket_id" UUID NOT NULL,
  "input_text" TEXT NOT NULL,
  "llm_output" JSONB,
  "corrected_output" JSONB,
  "corrected_by_user" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ai_interactions_user_bucket_created_at"
  ON "ai_interactions"("user_id", "bucket_id", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'buckets_user_id_fkey'
  ) THEN
    ALTER TABLE "buckets"
    ADD CONSTRAINT "buckets_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_user_id_fkey'
  ) THEN
    ALTER TABLE "notes"
    ADD CONSTRAINT "notes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_bucket_id_fkey'
  ) THEN
    ALTER TABLE "notes"
    ADD CONSTRAINT "notes_bucket_id_fkey"
      FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_interactions_user_id_fkey'
  ) THEN
    ALTER TABLE "ai_interactions"
    ADD CONSTRAINT "ai_interactions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_interactions_bucket_id_fkey'
  ) THEN
    ALTER TABLE "ai_interactions"
    ADD CONSTRAINT "ai_interactions_bucket_id_fkey"
      FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
