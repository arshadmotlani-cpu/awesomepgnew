# Room OS Smoke Tests

Run after every deploy and before flag cutover. Requires `DATABASE_URL`; cron tests require `CRON_SECRET` and deployed URL.

## 1. Unit tests (no DB)

```bash
node --import tsx --test tests/unit/roomOs*.test.ts
```

**Pass criteria:** 205/205 pass, 0 fail.

## 2. Build

```bash
npm run build
```

**Pass criteria:** exit 0.

## 3. Outbox cron drain

```bash
export CRON_SECRET="<secret>"
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<production-domain>/api/cron/room-os-outbox" | jq .
```

**Pass criteria:**

```json
{
  "ok": true,
  "deadLetter": 0,
  "errors": []
}
```

Note `pendingRemaining` — should decrease over repeated runs if backlog exists.

Alternative via post-deploy script:

```bash
CRON_SECRET=<secret> npx tsx scripts/post-deploy-ops.ts
```

## 4. Materialization freshness audit

```bash
DATABASE_URL=<prod> npx tsx scripts/run-room-os-materialization-audit.ts
```

**Pass criteria:**

- `pass: true` OR warnings only for missing rows pre-first-drain
- No `severity: fail` on index ages when flags are on and system has been running > 24h

## 5. Operations parity audit

```bash
DATABASE_URL=<prod> npx tsx scripts/run-room-os-ops-parity-audit.ts
```

**Pass criteria:**

- `sharedTabPass: true` (legacy vs Room OS counts match on shared tabs)
- `propertyIndexFailCount: 0`
- `workQueueFailCount: 0`

## 6. Certification wave 2 (baseline)

```bash
DATABASE_URL=<prod> npm run cert:room-os-wave2
```

**Pass criteria:** exit 0; report `status` not `fail`.

## 7. Certification wave 6 (full)

```bash
DATABASE_URL=<prod> npm run cert:room-os-wave6
```

**Pass criteria:** exit 0; no fail findings on:

- `WORKFLOW_PAYMENT_PROOF_PARITY` (state machine + instance sample)
- `BUSINESS_METRICS_ROLLUP_PARITY` (hash match when materialized)

## 8. Admin production audit

1. Log in as super_admin
2. Navigate to `/admin/system/production-audit`
3. Run audit

**Pass criteria:**

| Gate | Expected |
|------|----------|
| Room OS Outbox Health | PASS |
| Room OS Materialization Freshness | PASS (warnings OK pre-cutover) |
| Room OS Ops Centre Parity | PASS before flag cutover |

## 9. Benchmark (optional, staging)

```bash
DATABASE_URL=<staging> npm run bench:room-os-wave2
```

**Pass criteria:** index read median < 500ms when rooms ≤ 500 (Wave 1 gate per ROOM_OS.md).

## Quick smoke script (copy-paste)

```bash
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:?set DATABASE_URL}"
node --import tsx --test tests/unit/roomOs*.test.ts
npm run cert:room-os-wave2
npm run cert:room-os-wave6
npx tsx scripts/run-room-os-materialization-audit.ts
npx tsx scripts/run-room-os-ops-parity-audit.ts
echo "Smoke tests complete"
```

## After flag cutover

Re-run items 4, 5, 7, 8 and complete [09-manual-qa-checklist.md](./09-manual-qa-checklist.md).
