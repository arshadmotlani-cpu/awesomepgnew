# Memory — Changelog

> **Append-only** vault-level change log (auto-sync and brain updates).  
> App/feature ship history: [[CHANGELOG]] (formal second brain).

**Rule:** Never delete entries. Auto-sync commits append here via Cursor agent rule.

---

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

---
