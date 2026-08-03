#!/usr/bin/env bash
# Sequential admin perf partial runs — avoids concurrent production Neon load.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p test-results

run_profile() {
  local log="$1"
  shift
  echo "==> $(date -Iseconds) $*"
  NODE_ENV=development ADMIN_PROFILE=1 ADMIN_DB_PROFILE=1 \
    npx tsx scripts/profile-admin-full.ts "$@" | tee "$log"
}

echo "=== Admin perf sequential benchmark started $(date -Iseconds) ==="

# --- AFTER (optimized) ---
if [[ ! -f test-results/admin-perf-after-ops.json ]]; then
  run_profile /tmp/admin-perf-ops-after.log --label after-ops --only operations --quick
fi

run_profile /tmp/admin-perf-rev-col-after.log --label after-rev-col --only revenue,collections --quick

if [[ ! -f test-results/admin-perf-after-core.json ]]; then
  run_profile /tmp/admin-perf-core-after.log --label after-core --only overview,billing-dashboard --quick
fi

# --- BEFORE (HEAD baseline simulation) ---
run_profile /tmp/admin-perf-ops-before.log --label before-ops --baseline --only operations --quick
run_profile /tmp/admin-perf-rev-col-before.log --label before-rev-col --baseline --only revenue,collections --quick
run_profile /tmp/admin-perf-core-before.log --label before-core --baseline --only overview,billing-dashboard --quick

echo "==> Merging JSON artifacts..."
npx tsx scripts/merge-admin-perf-json.ts \
  test-results/admin-perf-after-ops.json \
  test-results/admin-perf-after-rev-col.json \
  test-results/admin-perf-after-core.json \
  -o test-results/admin-perf-after.json

npx tsx scripts/merge-admin-perf-json.ts \
  test-results/admin-perf-before-ops.json \
  test-results/admin-perf-before-rev-col.json \
  test-results/admin-perf-before-core.json \
  -o test-results/admin-perf-before.json

echo "==> Comparing..."
npx tsx scripts/compare-admin-perf.ts \
  test-results/admin-perf-before.json \
  test-results/admin-perf-after.json \
  docs/ADMIN_PERFORMANCE_REPORT.md

echo "==> Unit test..."
npx tsx --test tests/unit/adminCycleAudit.test.ts

echo "=== Done $(date -Iseconds) — docs/ADMIN_PERFORMANCE_REPORT.md ==="
