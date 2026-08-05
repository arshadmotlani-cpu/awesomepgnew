# Workforce Engine

> Universal employee identity, auth, roles, permissions, schedule, attendance/payroll foundations.  
> Phase 1 proving ground: storage in FYH Neon DB; **all access via `src/workforce/` only**.  
> Constitution: [[ECOSYSTEM_V2]] · Employee Brain: [[ECOSYSTEM_V2_BRAIN_REGISTRY#Employee Brain]] · Events: [[ECOSYSTEM_V2_EVENTS]]

## Golden rules

- Not “FYH Staff” — no salon-specific naming in the public API.
- One employee, multi-engine memberships — never duplicate people.
- Permissions evaluated **per engine**.
- Salon / PG / Capital consume Workforce; they do not own the employee SSOT.
- Moving to a dedicated Workforce DB later is a storage swap.

## Feature flag

`WORKFORCE_ENGINE=1` (or `true` / `on`) enables Workforce auth + admin surfaces on the FYH host.

## Module map

| Path | Role |
|------|------|
| `src/workforce/db/schema` | `wf_*` tables |
| `src/workforce/auth` | Mobile + password login, sessions |
| `src/workforce/permissions` | Rank / job role / grouped grants |
| `src/workforce/brains/employeeBrain.ts` | Employee Brain SSOT API |
| `src/workforce/events` | Domain event append |
| `src/hair/adapters/workforceStaffAdapter.ts` | Salon compatibility |

## Login

Mobile + password → Workforce session → engine memberships → FYH (or picker when multi).

Owner migration preserves existing `password_hash` from `fyh_admin_users.super_admin`.
