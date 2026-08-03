#!/usr/bin/env bash
# Before/after admin SSR benchmark against production Neon (.env.prod.live).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BEFORE_JSON="test-results/admin-perf-before.json"
AFTER_JSON="test-results/admin-perf-after.json"

mkdir -p test-results

echo "==> Running BEFORE benchmark (HEAD loader simulation via --baseline)..."
NODE_ENV=development ADMIN_PROFILE=1 ADMIN_DB_PROFILE=1 npx tsx scripts/profile-admin-full.ts --label before --baseline --quick
cp test-results/admin-perf-before.json "$BEFORE_JSON"

echo "==> Running AFTER benchmark (optimized loader simulation)..."
NODE_ENV=development ADMIN_PROFILE=1 ADMIN_DB_PROFILE=1 npx tsx scripts/profile-admin-full.ts --label after --quick
cp test-results/admin-perf-after.json "$AFTER_JSON"

echo "==> Comparing results..."
npx tsx scripts/compare-admin-perf.ts "$BEFORE_JSON" "$AFTER_JSON" docs/ADMIN_PERFORMANCE_REPORT.md

echo "==> Running adminCycleAudit unit test..."
npx tsx --test tests/unit/adminCycleAudit.test.ts

echo "Done. Report: docs/ADMIN_PERFORMANCE_REPORT.md"
