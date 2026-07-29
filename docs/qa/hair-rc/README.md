# Hair ERP RC — QA evidence

Automated verification substituted for manual screenshot capture in this RC cycle (2026-07-29).

| Viewport | Spec | Routes exercised |
|----------|------|------------------|
| Desktop 1280×800 | `hair-responsive.spec.ts`, `hair-ops.spec.ts` | customers, appointments, dashboard, search, settings, billing |
| Tablet 820×1180 | `hair-responsive.spec.ts` | customers, appointments |
| Mobile 390×844 | `hair-responsive.spec.ts`, ops scenario 15 | customers, appointments, search |
| Print | `hair-edge.spec.ts` scenario 16 | billing → invoice → print (`window.open` features) |

**Run locally:**

```bash
npm run hair:db:migrate && npm run hair:db:seed
HAIR_DEV_HOST=1 npx playwright test --project=hair-setup --project=hair --workers=1
node --import tsx --test tests/hair/integration/rcVisitLoop.test.ts
```

Formal verdict: [`docs/foryourhair/RELEASE_READINESS.md`](../../foryourhair/RELEASE_READINESS.md).
