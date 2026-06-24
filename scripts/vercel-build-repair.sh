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
if [ "${REPAIR_APG_0036_EXECUTE:-}" = "1" ]; then
  echo "Running APG-2026-0036 repair…"
  npx tsx scripts/final-repair-apg-2026-0036.ts --execute
fi
