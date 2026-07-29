# Shared family rules

## Parent company

**Awesome PG** is the company name. Product footers may show “Part of Awesome PG” where co-branding is needed. Do not replace product wordmarks with the parent name in app chrome.

## Shell DNA

- Dark bases: `#070A0F` (customer charcoal) · `#0B0F14` (admin / family shell)
- Sidebar header height: `4rem` (64px)
- Card radius: `12px` (marks) · `16px` (panels)
- Micro-labels: `text-[11px]` · `uppercase` · `tracking-[0.2em]`

## Title templates

| Product | Template |
|---------|----------|
| Awesome PG | `%s · Awesome PG` |
| APG OS | `%s · APG OS` |
| Capital OS | `%s · Capital OS` |
| For Your Hair ERP | `%s · For Your Hair ERP` |

## Typography (defaults)

| Surface | Font |
|---------|------|
| Customer | Geist Sans (`app/layout.tsx`) |
| APG OS admin | Geist Sans |
| Capital | System / app stack in `src/capital/styles/globals.css` |
| FYH ERP | Cormorant Garamond (display) + Outfit (UI) |

## Icon minimum sizes

- Favicon: 16px — simplify detail; use bold geometry below 24px
- Sidebar mark: 32px
- Login hero: 64–80px
- PWA: 192 + 512 (maskable duplicate at 512)

## Coexistence

Each product keeps its **own primary color**. Shared patterns are spacing, dark shells, and title structure — not a single accent hue.
