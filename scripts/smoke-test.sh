#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://api.gilloai.com}"

echo "Smoke test: health endpoint"
curl -fsS "${API_BASE_URL}/health" >/dev/null
echo "OK: ${API_BASE_URL}/health"

echo "Smoke test completed."
