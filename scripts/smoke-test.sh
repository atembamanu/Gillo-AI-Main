#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://api.gilloai.com}"
QUEUE_DASHBOARD_URL="${QUEUE_DASHBOARD_URL:-https://api.gilloai.com/queues/stats}"

echo "Smoke test: health endpoint"
curl -fsS "${API_BASE_URL}/health" >/dev/null
echo "OK: ${API_BASE_URL}/health"

echo "Smoke test: queue dashboard stats endpoint (auth may be required)"
curl -fsS "${QUEUE_DASHBOARD_URL}" >/dev/null || true
echo "Checked: ${QUEUE_DASHBOARD_URL}"

echo "Smoke test completed."
