#!/usr/bin/env bash
# Krishna APG-2026-0048 post-approval E2E (DB 10-check gate + production Playwright).
#
# Prerequisite: approve move-out in admin for APG-2026-0048 first.
#
#   ./scripts/run-krishna-post-approve-e2e.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export RESIDENT_VERIFY_BOOKING_CODE="${RESIDENT_VERIFY_BOOKING_CODE:-APG-2026-0048}"
export RESIDENT_VERIFY_REQUIRE_APPROVED=1
export RESIDENT_VERIFY_EXECUTE_DATE_PREVIEW=1
export BASE_URL="${BASE_URL:-https://www.awesomepg.in}"

echo "=== DB verification (10 checks) ==="
npx tsx scripts/verify-resident-moveout-dashboard.ts

echo ""
echo "=== Playwright (check 3 — no error card) ==="
npx tsx scripts/verify-resident-moveout-playwright.ts

echo ""
echo "All Krishna post-approve checks passed."
