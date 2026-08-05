# Workforce Engine v1

> Universal employee identity, auth, roles, permissions, schedule, attendance/payroll foundations.  
> **Proving ground:** storage in FYH Neon DB; **all access via `src/workforce/` only**.  
> Constitution: [[ECOSYSTEM_V2]] · Employee Brain: [[ECOSYSTEM_V2_BRAIN_REGISTRY#Employee Brain]] · Baseline: [[ECOSYSTEM_BASELINE_V1]]

## Golden rules

- Not “FYH Staff” — no salon-specific naming in the public API.
- One employee, multi-engine memberships — never duplicate people.
- Permissions evaluated **per engine**.
- Salon / PG / Capital consume Workforce; they do not own the employee SSOT.
- Do **not** extend `fyh_staff` / legacy admin sprawl — migrate into Workforce.
- Moving to a dedicated Workforce DB later is a storage swap.
- **Do not** modify Health Brain / Repair Engine / PG / Capital while shipping Workforce unless fixing a production bug. Health Score must remain **100** ([[ECOSYSTEM_BASELINE_V1]]).

## Feature flag

`WORKFORCE_ENGINE=1` (or `true` / `on`) enables Workforce auth + admin surfaces on the FYH host.  
When enabled, `/staff` redirects to `/workforce`.

## Ranks (Phase 1)

| Rank | UI label | Meaning |
|------|----------|---------|
| `owner` | Owner | Full permissions |
| `manager` | Manager | Ops + staff admin (no settings by default) |
| `team_member` | Staff | Role-based grants (stylist, receptionist, …) |

**Designation** in the UI maps to `job_role` (stylist, receptionist, …).

## Module map

| Path | Role |
|------|------|
| `src/workforce/db/schema` | `wf_*` tables |
| `src/workforce/auth` | Mobile + password login, sessions |
| `src/workforce/permissions` | Rank / job role / grouped grants |
| `src/workforce/brains/employeeBrain.ts` | Employee Brain SSOT API |
| `src/workforce/events` | Domain event append |
| `src/workforce/labels.ts` | Owner / Manager / Staff display labels |
| `src/hair/adapters/workforceStaffAdapter.ts` | Salon compatibility |

## Login

Mobile + password → Workforce session → engine memberships → FYH (email fallback during migration).

Owner migration preserves existing `password_hash` from `fyh_admin_users.super_admin`.

```bash
npx tsx scripts/hair/migrate-to-workforce.ts          # dry-run
npx tsx scripts/hair/migrate-to-workforce.ts --apply  # execute
```

## v1 roadmap

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Employee DB · Owner/Manager/Staff · phone+password · roles · permissions | **Complete** |
| **2** | Add Employee popup (full profile fields + designation) | In progress |
| **3** | Owner / Manager / Staff dashboards (role-scoped) | Pending |
| **4** | Appointments · hours · attendance · performance · salary · commission · incentives | Pending |
| **5** | Wire Workforce Brain → Finance / Health / Appointment / Customer / Owner | Pending |

## Definition of done (each phase)

1. `npm run build`
2. Workforce / Hair tests green (`node --import tsx --test tests/unit/workforceEngine.test.ts` + `npm run test:hair` when relevant)
3. Health Score remains **100** (`npx tsx --tsconfig tsconfig.json scripts/independent-ecosystem-baseline-audit.ts`)
4. Commit + push (Workforce-only; do not bundle unrelated Health Brain diffs)
