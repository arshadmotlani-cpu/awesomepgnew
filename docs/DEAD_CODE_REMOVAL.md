# Dead Code Removal Log

**Phase 13** — Safe deletions during stabilization.

| Date | Removed | Reason |
|------|---------|--------|
| 2026-06-13 | `ResidentOperationsQueue.tsx` | Never imported; superseded by `ResidentsOperationsActionQueue` |
| 2026-06-13 | `/admin/requests` page UI | Redirect to `/admin/checkout-settlements` (DR-02) |

## Retained (intentional)

| Item | Reason |
|------|--------|
| `ControlBoard.tsx` | `loadControlBoardDrillDown` used by overview actions |
| Redirect routes (`/admin/collections`, `/admin/rent`, etc.) | External bookmarks — collapsed to single hop where possible |
| `admin_notifications` table | Legacy read bridge; writes via sync until full migration |

## Redirect chains collapsed

| Before | After |
|--------|-------|
| `/admin/collections` → `/admin/revenue/billing` → `/admin/billing` | `/admin/collections` → `/admin/billing` |
