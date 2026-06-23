# H10 screenshot index

## After (captured June 2026)

Run: `BASE_URL=http://localhost:3000 node scripts/h10-resident-screenshots.mjs`

| Route | 390px | 768px | 1280px |
|-------|-------|-------|--------|
| Login | `after/login-390.png` | `after/login-768.png` | `after/login-1280.png` |
| Resident home | `after/resident-home-390.png` | … | … |
| Resident payments | `after/resident-payments-390.png` | … | … |
| Resident wallet | `after/resident-wallet-390.png` | … | … |
| Resident requests | `after/resident-requests-390.png` | … | … |
| Bookings | `after/bookings-390.png` | … | … |

Without auth cookie, resident routes show the login redirect — use `H10_SCREENSHOT_COOKIE` for authenticated hub captures.

## Before

See [`before/README.md`](./before/README.md) — textual audit only (no PNG archive).
