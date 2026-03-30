#!/usr/bin/env sh
set -eu

# Run Prisma migrations in the api-server container:
#   docker exec -it <api-container> sh /app/scripts/run_prisma_migrate_deploy.sh

if [ "${DATABASE_URL:-}" = "" ]; then
  DATABASE_URL="$(python3 /app/scripts/build_database_url_for_prisma.py)"
  export DATABASE_URL
fi

cd /app

# Use npx to ensure the local prisma CLI is used.
npx prisma migrate deploy

