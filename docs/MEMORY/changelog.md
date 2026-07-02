# Memory — Changelog

> **Append-only** vault-level change log (auto-sync and brain updates).  
> App/feature ship history: [[CHANGELOG]] (formal second brain).

**Rule:** Never delete entries. Auto-sync commits append here via Cursor agent rule.

---

## 2026-07-02

- **OPS-PROD-STABILIZE** — Phases 3–5: Resident Command Center cleanup (actionable pending reviews only, timeline technical toggle, simplified quick actions); Refund Console as sole refund workflow (`refundConsoleHref` SSOT); legacy deposit settlement UI removed from deposit detail; checkout refund payout → Refund Console; `scripts/verify-refund-console-ssot.ts`
- **OPS-MAINTENANCE-REMOVE** — Maintenance removed from Operations queue/filter; legacy opsCenter task injection dropped; maintenance action items auto-resolved; bed status control on PG map (Available/Occupied/Reserved/Under Maintenance)
- **FIN-SSOT-SPRINT** — Billing Cycle Engine, Financial Metrics Engine (read-only revenue), Refund Console (`/admin/refunds`), structured deduction categories (0096), invoice timeline collapsed at bottom, maintenance beds viewable on website, legacy deposit refund paths blocked → `docs/FINANCIAL_SSOT_AUDIT_REPORT.md` · `scripts/verify-financial-ssot.ts`

## 2026-06-23

- **NAV-SB-01** — Fix admin sidebar navigation: drop periodic layout refresh race, optimistic active state, nav timing instrumentation → [[BUGS#NAV-SB-01]]
- **BOOK-DATE-01** — StayDateRangePicker z-index + 44px Edit target; BedBookingPanel 3-step wizard → [[BUGS#BOOK-DATE-01]] · [[Bookings]] · [[CHANGELOG]]
- **VAC-B5-01** — Room 203 B5 vacating crash + refund badge/list mismatch → [[BUGS#VAC-B5-01]] · `scripts/investigate-bed-203-b5.ts` · `scripts/repair-bed-203-b5.ts`
- **Regression net** — `criticalJourneys.test.ts`, Playwright smoke, CI workflow, `/admin/health` smoke checks, `DEPLOYMENT_CHECKLIST.md`

## 2026-06-22

- **Live AI brain system** — `docs/.cursor/rules.md`, `scripts/brain-sync.sh`, `MEMORY/bugs.md`, `MEMORY/changelog.md`
- **Vault pushed to GitHub** — `git@github.com:arshadmotlani-cpu/awesomepg-docs.git` (`30e661d`)
- **MEMORY/SYSTEM/PROJECT layout** — auto-structured memory architecture enforced
- **BUG fixes shipped** — VAC-CRASH-02, VAC-DATE-01, EXP-INV-01, SEARCH-01 → [[BUGS]] · [[CHANGELOG]]

## 2026-06-21

- **Second brain vault** — 12 core docs + 18 domain hubs + wiki-link graph
- **Standalone docs Git** — `d0a5201` initial vault commit
- **Pre-commit doc sync** — app repo hook flags staged code → brain docs
- **Vacating ops fixes** — `d4c01c6`, checkout-month rent `369bddb`, bed SSOT `88a16e8`

---

## Auto-sync entries

When `brain-sync.sh` or Cursor agent completes a memory update, append:

```markdown
## YYYY-MM-DD HH:MM UTC
- brain: auto-sync memory update — [areas touched]
```

---

## Related

[[CHANGELOG]] · [[active_memory]] · [[decisions]] · [[tasks]] · [[START_HERE]]

<!-- AGENT_2026-06-21T19:41:12Z -->
## 2026-06-21 (agent · 2026-06-21T19:41:12Z)

- **Type:** active
- **Files:**
- `.cursor/rules.md`
- `MEMORY/active_memory.md`


<!-- AGENT_LOG_2026-06-21T19:41:12Z -->
- **2026-06-21T19:41:12Z** — agent classified `active` (7 file(s))

<!-- INTEL_LOG_2026-06-21T19:59:31Z -->
- **2026-06-21T19:59:31Z** | **BUG** | 4 files changed, 217 insertions(+), 104 deletions(-)
  - Files: .gitignore,MEMORY/active_memory.md,INTELLIGENCE.md

<!-- INTEL_LOG_2026-06-21T19:59:45Z -->
- **2026-06-21T19:59:45Z** | **BUG** | 11 files changed, 368 insertions(+), 104 deletions(-)
  - Files: .gitignore,INTELLIGENCE.md,MEMORY/active_memory.md,MEMORY/bugs.md,MEMORY/changelog.md,MEMORY/decisions.md,MEMORY/ideas.md,MEMORY/insights.md,MEMORY/tasks.md

<!-- INTEL_LOG_2026-06-21T20:03:44Z -->
- **2026-06-21T20:03:44Z** | **BUG** | 6 files changed, 360 insertions(+), 59 deletions(-)
  - Files: .gitignore,INTELLIGENCE.md,MEMORY/active_memory.md

<!-- SEMANTIC_2026-06-21T20:04:15Z -->
---
Time: 2026-06-21T20:04:15Z
Type: MIXED
Impact: MEDIUM
Reason: The AI memory / intelligence automation layer is being extended — cognition pipeline or MEMORY structure changed.
Files:
- scripts/brain-agent.sh
- scripts/brain-semantic.sh

---

<!-- SEMANTIC_2026-06-21T20:59:03Z -->
---
Time: 2026-06-21T20:59:03Z
Type: MIXED
Impact: HIGH
Reason: Move-out and checkout documentation is evolving — likely reflecting vacating ops or refund workflow changes.
Files:
- AI_SYSTEM_PROMPT.md
- BUGS.md
- Billing.md
- CHANGELOG.md
- Checkout Settlements.md
- MEMORY/bugs.md
- MEMORY/changelog.md
- Vacating.md

---

## 2026-07-02

- **RESIDENT-PORTAL-V2** — Redesigned resident hub: 5-tab nav (Profile, Payments, Requests, Referrals, Concierge); Profile sub-tabs (Overview, Wallet); Payments sub-tabs (Bills Due, Invoices); room change workflow + referral DB (`0093_resident_portal_v2.sql`); booking review line-item breakdown + Awesome PG policies → `docs/MEMORY/decisions-resident-portal-v2.md`
- **OCCUPANCY-SSOT-AUDIT** — Admin vs Public bed state drift (Room 102 B1); traced 6 compute paths + 2 label functions; proposed `bedOccupancyEngine.ts` SSOT + parity tests → `docs/OCCUPANCY_SSOT_AUDIT.md` · [[BED_EXPLORER_SSOT_PLAN]]
- **BOOKING-APPROVAL-OCCUPANCY** — Admin Occupied vs Public Available soon after payment approval; root cause = `deriveCustomerBedAvailabilityView` label priority, not DB/cache → `docs/BOOKING_APPROVAL_OCCUPANCY_INVESTIGATION.md`
- **CRITICAL-BOOKING-AUTH** — Room 102 B1 lifecycle vs date display fix (`isOccupiedToday` on public); Harshal split-identity root cause; auth integrity admin page → `docs/CRITICAL_BOOKING_AUTH_INVESTIGATION.md`
- **APG-2026-0036-BOOKING-MODEL** — Production verified: 0036 = fixed_stay B3 (₹2,685 / 7 nights); current B1 Aug-1 = monthly APG-2026-0040 (₹8,242); occupancy bug = shared checkout-date semantics → `docs/APG-2026-0036_BOOKING_MODEL_INVESTIGATION.md`
- **BOOKING-LIFECYCLE-SSOT-PLAN** — Plan approved: Phase 1→2→2b→3→4; unbounded `[check_in,)`; admin checkout_pending; PG deposit policy inheritance; global 1-day buffer → `docs/BOOKING_LIFECYCLE_SSOT_PLAN.md`
- **BOOKING-LIFECYCLE-PHASE-1** — Occupancy SSOT engine (`bedOccupancyEngine.ts`), `OCCUPANCY_ENGINE_V2` flag, pgBedMap + customer query wiring, checkout-pending rules (monthly mandatory / fixed workflow-only), Phase 3 migration gated
- **BOOKING-LIFECYCLE-PHASE-1-COMPLETE** — All display/count surfaces migrated; flag removed; `bedOccupancyResolve` + `bedOccupancyBatch`; audit → `docs/PHASE_1_OCCUPANCY_AUDIT.md`
- **BOOKING-LIFECYCLE-PHASES-2-2B-3** — Maintenance first-class; reservation product (50% optimized rent, auto-convert); monthly unbounded stay_range + deposit policy PG UI; report → `docs/PHASES_2_3_IMPLEMENTATION_REPORT.md`
- **AUTH-SSOT** — Investigation report + `customerIdentityMerge` (full FK reassign); auth integrity detectors (orphan KYC/wallet, booking without customer, incomplete with password); repair merges wallet/KYC/invoices; masked forgot-password email → `docs/AUTH_SSOT_INVESTIGATION.md`
- **RESIDENT-AUTH-SESSIONS** — Remember-device (75d default), sliding refresh (14d threshold), silent `/api/auth/customer/session/refresh`, active sessions panel + logout-all, password/forgot-password revoke all sessions; admin sessions unchanged
- **RESIDENT-AUTH-REPAIR-7083608128** — Unarchived canonical customer `bc9aa020-…` (Harshal Deotale), expired stale signup session `7557` email conflict; phone/email login restored
- **EXP-BOOKING-IDEMPOTENCY** — Express Booking saga: rollback cancelled rent invoice tombstones blocked retry; server idempotency + persistent UI errors on double submit
- **EXP-BOOKING-RETRY-HARDEN** — Rollback purges unpaid rent invoices (no tombstones); `ensureMonthlyRentInvoice` regenerates after express rollback; two-step confirm UI + processing lock; rollback failure surfaces retryable state
- **EXP-BOOKING-TOMBSTONE-FIX** — Paid+cancelled rent tombstones (paymentId set) blocked purge; expressWalkInRetry flag; rollback deletes all rent rows; fixed-stay recovery; viewport-bound invoice preview aside
- **EXP-BOOKING-LAYOUT** — Split-pane express workspace; lock admin shell scroll; pinned preview footer; layout E2E
- **PRODUCTION-STABILIZATION** — Five-phase investigation batch: auth/session, electricity Room 203, Pay All UX (removed misleading CTA), UPI audit, occupancy SSOT approval request; read-only audit script; master sign-off → `docs/PRODUCTION_STABILIZATION/`
- **PRODUCTION-STABILIZATION-P0** — P0 code fixes: session cookie-clear on reject, 30d standard TTL, checkout occupant exclusion for Room 203, UPI SSOT resolver + non-destructive defaults; `scripts/verify-production-p0.ts`
- **BED-MAINTENANCE** — First-class maintenance workflow: schema metadata, bed map Advanced Tools (put/complete), red admin tiles + customer exclusion, engine labels with reason/dates

---
