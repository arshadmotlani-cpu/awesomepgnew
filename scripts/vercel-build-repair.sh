#!/usr/bin/env bash
set -euo pipefail
if [ "${REPAIR_APG_0036_EXECUTE:-}" = "1" ]; then
  echo "Running APG-2026-0036 repair…"
  npx tsx scripts/final-repair-apg-2026-0036.ts --execute
fi
