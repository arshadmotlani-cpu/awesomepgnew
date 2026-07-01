# Memory — Decisions

> **Append-only** log of decisions made (operational + strategic).  
> Formal ADRs with full rationale: [[DECISIONS]] (do not duplicate — cross-link instead).

**Rule:** One bullet per decision. Never delete entries.

---

## 2026-07-02

- **Resident Portal V2** — Consolidated 9 tabs into 5; Profile owns stay + wallet; Payments owns due + paid history; move-out merged into Requests; referral + room-shift backends added. Defaults: `docs/MEMORY/decisions-resident-portal-v2.md`

## 2026-06-22

- Adopted **MEMORY/** folder for auto-structured AI memory (ideas, tasks, insights, mistakes, decisions, active_memory)
- Moved system docs to `SYSTEM/` and project inventory to `PROJECT/features.md` — vault structure enforced
- Docs vault is standalone Git repo at `/Users/aashumotlani/awesomepg/docs` with fswatch auto-sync scripts

## 2026-06-21

- Maintain `/docs` as Obsidian-compatible second brain; update on every code change ([[DECISIONS#Documentation second brain]])
- On vacating submit/approve, auto pro-rate checkout-month rent via `vacatingCheckoutBilling.ts` ([[DECISIONS#Vacating checkout rent sync]])
- Split vacate notice from deposit refund — meter/UPI only after approve + vacate date ([[DECISIONS#Split vacate request from deposit refund]])
- Primary operator actions live in [[Operations]] queue ([[DECISIONS#Operations as action hub]])
- Serialize `Date` → ISO before passing to client components ([[DECISIONS#Client Date serialization]])
- Align bed map and residents list via `occupancySsot.ts` ([[DECISIONS#Bed assignment SSOT alignment]])

---

## How to append

```markdown
## YYYY-MM-DD
- Decided to … (link [[DECISIONS#…]] if formal ADR exists)
```

---

## Related

[[active_memory]] · [[DECISIONS]] · [[insights]] · [[AI_CONTEXT]]

<!-- INTEL_2026-06-21T19:59:31Z -->
### 2026-06-21T19:59:31Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 4 files changed, 217 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `MEMORY/active_memory.md`
- `INTELLIGENCE.md`


<!-- INTEL_2026-06-21T19:59:45Z -->
### 2026-06-21T19:59:45Z

- **Types:**  · REFACTOR ·  · BUG ·  · DECISION ·  · INSIGHT ·  · TASK ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 11 files changed, 368 insertions(+), 104 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `MEMORY/decisions.md`
- `MEMORY/ideas.md`
- `MEMORY/insights.md`
- `MEMORY/tasks.md`


<!-- INTEL_2026-06-21T20:03:44Z -->
### 2026-06-21T20:03:44Z

- **Types:**  · REFACTOR ·  · BUG ·  · TASK ·  · DECISION ·  · INSIGHT ·  · FEATURE · 
- **Primary:** BUG
- **Summary:** 6 files changed, 360 insertions(+), 59 deletions(-)
- **Files:**
- `.gitignore`
- `INTELLIGENCE.md`
- `MEMORY/active_memory.md`


<!-- INTEL_2026-06-21T20:59:03Z -->
### 2026-06-21T20:59:03Z

- **Types:**  · REFACTOR ·  · BUG ·  · FEATURE ·  · TASK ·  · DECISION ·  · INSIGHT · 
- **Primary:** BUG
- **Summary:** 8 files changed, 328 insertions(+), 6 deletions(-)
- **Files:**
- `AI_SYSTEM_PROMPT.md`
- `BUGS.md`
- `Billing.md`
- `CHANGELOG.md`
- `Checkout Settlements.md`
- `MEMORY/bugs.md`
- `MEMORY/changelog.md`
- `Vacating.md`

