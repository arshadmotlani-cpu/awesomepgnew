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

Sentinel shield + geometric **A** (Concept 02 — approved).

## Logo usage

- Sidebar: compact lockup (`ApgOsSidebarBrand`)
- Auth: `AdminLoginShell` + `ApgOsLogoLockup`
- Favicons: SVG under `/admin-os/`

## Do

- Use `apgOsAdminMetadata` on all admin layouts
- Use shield geometry from `apgOsIconGeometry.ts` for any new SVG

## Don’t

- Reintroduce customer orange in **shell** chrome (in-app CTAs may still use legacy orange until a separate pass)
- Use Awesome PG house mark on admin login

## Code

- Tokens: `src/lib/brand/apgOsTokens.ts`
- Metadata: `src/lib/brand/apgOsAdminMetadata.ts`
- Assets: `public/admin-os/`
- CSS: `src/styles/apg-os-tokens.css`

## History

Concept boards: `docs/qa/apg-os-concepts/` · Approved: **02-sentinel-shield**
