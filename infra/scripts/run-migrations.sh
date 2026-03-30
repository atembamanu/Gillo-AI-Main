#!/usr/bin/env bash
# Apply all SQL migrations in order. Run from repo root after Postgres is up.
# Usage:
#   ./infra/scripts/run-migrations.sh
#   COMPOSE_FILE=docker-compose.prod.yml ./infra/scripts/run-migrations.sh
#
# POSTGRES_USER in .env is only applied when the data volume is first created.
# If you changed POSTGRES_USER after the volume existed, the DB may still only
# have the original role (often "postgres"). This script falls back to -U postgres.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Load .env so POSTGRES_* match docker compose (optional; +H avoids ! in passwords breaking history expansion)
if [[ -f "$ROOT/.env" ]]; then
  set +H
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

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

POSTGRES_DB="${POSTGRES_DB:-notes}"
REQUESTED_USER="${POSTGRES_USER:-postgres}"

# Pick a DB role that can connect (volume may have been initialized with another user)
PSQL_USER="$REQUESTED_USER"
if ! docker compose -f "$COMPOSE_FILE" exec -T gillo-ai-main-fcpjel-postgres-1 \
  psql -v ON_ERROR_STOP=1 -U "$PSQL_USER" -d "$POSTGRES_DB" -c "SELECT 1" >/dev/null 2>&1; then
  if [[ "$PSQL_USER" != "postgres" ]]; then
    echo "Note: role \"$PSQL_USER\" does not exist or cannot connect (common if the DB volume was created with POSTGRES_USER=postgres). Retrying as postgres..." >&2
    PSQL_USER="postgres"
  fi
fi

echo "Applying migrations to database ${POSTGRES_DB} as ${PSQL_USER} (compose: ${COMPOSE_FILE})..."
cat "${MIGRATIONS[@]}" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$PSQL_USER" -d "$POSTGRES_DB"

echo "Migrations finished."
