#!/usr/bin/env bash
# Apply all SQL migrations in order. Run from repo root after Postgres is up.
# Usage:
#   ./infra/scripts/run-migrations.sh
#   COMPOSE_FILE=docker-compose.prod.yml ./infra/scripts/run-migrations.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
MIGRATIONS=(
  infra/migrations/001_init.sql
  infra/migrations/002_bucket_fields.sql
  infra/migrations/003_add_note_archived.sql
  infra/migrations/004_user_display_name.sql
  infra/migrations/005_add_audio_columns.sql
  infra/migrations/006_add_audio_metadata.sql
)

for f in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing migration file: $f" >&2
    exit 1
  fi
done

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-notes}"

echo "Applying migrations to database ${POSTGRES_DB} as ${POSTGRES_USER} (compose: ${COMPOSE_FILE})..."
cat "${MIGRATIONS[@]}" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Migrations finished."
