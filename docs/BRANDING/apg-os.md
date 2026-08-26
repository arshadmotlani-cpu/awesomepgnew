# APG OS (admin)

## Purpose

Operations — Awesome PG Admin Panel.

## Primary

- Blue: `#2563EB`
- Shield navy: `#1E293B`
- Shell: `#0B0F14`

## Feel

Enterprise · Control · Operating system

## Symbol

Interlocking geometric **PG** mark (metallic white P, orange→gold G) on dark charcoal rounded square. The mark itself is the logo — no “ADMIN” word, house, or bed.

## Logo usage

- Sidebar: `ApgOsSidebarBrand` (uses `ApgOsMark`)
- Header: `ApgOsMark` in `AdminTopNav`
- Auth: `AdminLoginShell`
- Favicons: PNG under `/admin-os/` (`pg-admin-mark.png` is canonical)

## Do

- Use `apgOsAdminMetadata` on all admin layouts
- Use `public/admin-os/pg-admin-mark.png` as the only mark source

## Don’t

- Redesign or substitute a different PG monogram
- Stretch, crop, or add taglines to the mark
- Reintroduce customer orange in **shell** chrome (in-app CTAs may still use legacy orange until a separate pass)
- Use Awesome PG house mark on admin login

## Code

- Tokens: `src/lib/brand/apgOsTokens.ts`
- Metadata: `src/lib/brand/apgOsAdminMetadata.ts`
- Assets: `public/admin-os/`
- CSS: `src/styles/apg-os-tokens.css`

## History

Concept boards: `docs/qa/apg-os-concepts/` · Approved: **02-sentinel-shield**
