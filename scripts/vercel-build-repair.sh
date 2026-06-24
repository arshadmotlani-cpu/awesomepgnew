#!/usr/bin/env bash
set -euo pipefail
if [ "${VERIFY_APG_0036_E2E:-}" = "1" ]; then
  echo "Running APG-2026-0036 production E2E verification…"
  npx tsx scripts/verify-apg-0036-production.ts
fi
if [ "${DIAGNOSE_DEPOSIT_0032_0036:-}" = "1" ]; then
  npx tsx scripts/diagnose-deposit-0032-0036.ts
fi
if [ "${SYNC_DEPOSIT_0032_0036:-}" = "1" ]; then
  echo "Syncing APG-2026-0032 / 0036 deposit collection fields…"
  npx tsx scripts/sync-deposit-0032-0036.ts
fi
if [ "${DISCOVER_BOOKING_RENT_GAPS:-}" = "1" ]; then
  echo "Discovering booking rent invoice gaps…"
  npx tsx scripts/discover-booking-rent-invoice-gaps.ts || true
fi
if [ "${REPAIR_APG_0036_EXECUTE:-}" = "1" ]; then
  echo "Running APG-2026-0036 repair…"
  npx tsx scripts/final-repair-apg-2026-0036.ts --execute
fi
if [ "${BACKFILL_BOOKING_RENT_INVOICES:-}" = "1" ]; then
  echo "Backfilling booking rent invoices…"
  npx tsx scripts/backfill-booking-rent-invoices.ts --execute || true
fi
if [ "${REPAIR_BOOKING_RENT_0035_0036:-}" = "1" ]; then
  echo "Auditing + repairing APG-2026-0035 / 0036 booking rent invoices…"
  npx tsx scripts/audit-repair-booking-rent-0035-0036.ts --execute || true
fi
