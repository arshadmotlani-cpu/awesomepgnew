# Mobile & PWA Audit

**Phase 11** — Viewport checklist for Awesome PG admin + resident surfaces.

## Viewports

| Width | Device class | Priority |
|-------|--------------|----------|
| 375px | iPhone SE | P0 |
| 390px | iPhone 14 | P0 |
| 430px | iPhone Pro Max | P1 |
| 768px | Tablet portrait | P1 |
| 1024px+ | Desktop | P0 |

## Admin PWA

| Check | Status | Notes |
|-------|--------|-------|
| `manifest.webmanifest` installable | OK | `start_url` → `/admin` |
| Service worker push + badge | OK | `public/sw.js` |
| Safe area insets | OK | `100dvh` shell, `safe-area-inset-bottom` |
| Sidebar → mobile drawer | OK | `MobileNav` below `lg` |
| Touch targets ≥44px | Review | Primary CTAs on billing/ops |
| Tables horizontal scroll | Fix | Checkout settlements table — `overflow-x-auto` on wrappers |

## Resident portal

| Check | Status |
|-------|--------|
| Hub tabs usable at 375px | OK |
| Payment due rows readable | OK |
| No resident PWA manifest | By design (responsive web) |

## Landscape

- Admin ops queue: verify filter chips wrap
- Booking pay page: QR + summary stack vertically

## Offline

- Admin: no offline shell (push only)
- Resident: no offline (documented)

## Verification command

Manual walkthrough at each width; Lighthouse mobile on `/admin/overview` and `/account/profile?section=resident`.
