# P1 Resident Redesign — Complete Summary

**Completed:** 2026-06-19  
**Scope:** All five P1 resident-facing screens — presentation layer only  
**Methodology:** [00-methodology.md](./00-methodology.md)

---

## Screens delivered

| # | Screen | Route(s) | Audit doc | Commit |
|---|--------|----------|-----------|--------|
| 1 | Resident Home | `?section=resident&tab=home` | [p1-01](./p1-01-resident-home.md) | `fdaaf3e` |
| 2 | Requests Center | `?tab=requests` | [p1-02](./p1-02-requests-center.md) | `55944a0` |
| 3 | Wallet | `?tab=wallet` | [p1-03](./p1-03-wallet.md) | `2bc3243` |
| 4 | Payments | `?tab=payments` | [p1-04](./p1-04-payments.md) | `4426aaa` |
| 5 | Application Dashboard | `/account/bookings`, profile, `/booking/[code]` | [p1-05](./p1-05-application-dashboard.md) | (this batch) |

---

## Before / after action counts (visible)

| Screen | Before (approx.) | After (visible) |
|--------|------------------|-----------------|
| **Resident Home** | 10+ pay/vacating/PS4/refund/table actions | **≤5** What to do next + Pay on upcoming rows |
| **Requests Center** | 10 equal cards + duplicate forms | **1** Create move-out + grouped cards + More |
| **Wallet** | Financial summary + 5 wallet stats + open ledger | **4** summary stats + **≤3** actions + More ledger |
| **Payments** | Expanded invoice tables + scattered Pay | **≤5** actions + bill list + More tables |
| **Application** | Tracker only / list only / banner Pay | **1** primary next step per surface |

---

## Duplicates removed

| Pattern | Screens |
|---------|---------|
| Financial summary + 4-card grid + wallet | Home |
| Invoice tables on Home | Home → Payments |
| Deposit refund form on Home + Requests | Requests More only |
| Admin ops status pills | Home |
| Tab counts in headers + summary | KYC-style pattern avoided on resident |
| Pay button in booking banner + body | Booking detail → primary section only |
| Full ledger / tables always open | Wallet & Payments → More |

---

## Jargon removed (representative)

| Before | After |
|--------|-------|
| Outstanding | Amount due |
| KYC | Identity check |
| Financial summary / Required·Paid·Outstanding | Your stay / Balance summary |
| Deposit wallet / credit | Security deposit balance |
| Vacating | Move-out notice |
| Application progress | Your move-in journey |
| Verify → / Pay → | Review documents / Pay |
| Via support | Message on WhatsApp |

**GlossaryTip** added for: refundable deposit, move-out notice, deposit (application tracker).

---

## Screens simplified

| Screen | Key simplification |
|--------|-------------------|
| Home | One stay summary · one primary action · upcoming bills only |
| Requests | Grouped by type · single create entry · history section |
| Wallet | 4 balance stats · ledger collapsed |
| Payments | Summary-first · mobile bill list |
| Application | Journey tracker + explicit next step on every surface |

---

## Shared components introduced

- `GlossaryTip` — inline term help
- `ResidentMoreSection` — collapsed More / advanced (resident theme)
- `ResidentHomePanel`, `ResidentWalletPanel`, `ResidentPaymentsPanel`
- `RequestsCenter` (redesigned)
- `ApplicationStatusTracker` (redesigned)
- `ApplicationBookingsList`, `ApplicationBookingPrimaryActions`

---

## Validation

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (each screen) |
| TypeScript | ✅ Clean |
| Business logic / permissions / APIs | ✅ Unchanged |

---

## Remaining resident screens (not in P1 scope)

| Screen | Route | Notes |
|--------|-------|-------|
| My room | `?tab=room` | Profile-style panel — lower traffic |
| Move-out tab | `?tab=vacating` | Dedicated vacating UI (partially linked from Requests) |
| Concierge | `?tab=concierge` | AI chat |
| Notifications | `?tab=notifications` | Email notification list |
| Referrals | `?tab=referrals` | Referral program |
| Identity section | `?section=identity` | KYC upload — related but separate from hub tabs |
| Pay sub-routes | `/account/resident/pay-*` | Payment flows — keep as-is |
| Payment history | `/account/resident/history/[id]` | Drill-down |
| Request vacating | `/account/resident/request-vacating/[id]` | Form flow |
| Guide | `/guide` | Static help — could link from hub later |

---

## Next gate

**P1 resident complete.** Public website **P2** remains blocked until stakeholder sign-off on resident flows:

1. Public Home  
2. Property Pages  
3. Room Explorer  
4. Bed Explorer  
5. Booking Flow  
