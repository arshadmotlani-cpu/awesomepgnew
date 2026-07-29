# Assets manifest

Canonical paths after branding sprint. Regenerate PNGs with `node scripts/export-brand-from-svg.mjs`.

## Awesome PG — `public/awesome-pg/`

| File | Size | Purpose |
|------|------|---------|
| `favicon-16.svg` … `favicon-48.svg` | 16–48 | Browser tab |
| `icon-64.svg` … `icon-512.svg` | 64–512 | PWA |
| `apple-touch-icon.svg` | 180 | iOS |
| `og-mark.svg` | 512 | OG (raster 1200×630 manual) |
| `mark-filled.svg` | vector | Primary |
| `mark-mono-dark.svg` / `mark-mono-light.svg` | vector | Monochrome |
| `logo-full-dark.svg` / `logo-full-light.svg` | vector | Marketing |

Customer PNG fallbacks: `public/icons/apg-*` (exported).

## APG OS — `public/admin-os/`

See `docs/BRANDING/apg-os.md`. Full SVG set already in repo.

## Capital OS — `public/capital-os/`

Same size ladder as Awesome PG. PNG exports: `public/capital/icons/`.

## For Your Hair — `public/fyh/`

Same size ladder. Purple FY monogram SVGs.

## Manifests

| Product | Path |
|---------|------|
| Awesome PG customer | `/awesome-pg/manifest.webmanifest` |
| APG OS admin | `/admin-os/manifest.webmanifest` |
| Capital OS | `/capital/manifest.webmanifest` |
| FYH ERP | `/fyh/manifest.webmanifest` |

## Remaining manual design work

- [ ] OG images at **1200×630** per product (export from Figma or rasterize composed art)
- [ ] Capital 1024 PNG master refresh if green mark differs from legacy orange master
- [ ] HTML email header templates (optional art)
- [ ] FYH full UI recolor to purple (deferred)
- [ ] Admin in-app orange CTA → APG blue token migration (deferred)

## QA matrix

| Check | Awesome PG | APG OS | Capital | FYH |
|-------|------------|--------|---------|-----|
| Favicon loads | `/awesome-pg/favicon-32.svg` | `/admin-os/favicon-32.svg` | `/capital-os/favicon-32.svg` | `/fyh/favicon-32.svg` |
| Title template | layout | admin layout | capital layout | hair layout |
| Login branded | N/A (OTP) | AdminLoginShell | Capital login | FyhLoginBrandHeader |
| Sidebar branded | SiteHeader | ApgOsSidebarBrand | CapitalOsLogoLockup | FyhSidebarBrand |
| Preview route | `/brand/awesomepg` | `/brand/apgos` | `/brand/capital` | `/brand/fyhair` |
| PWA theme matches primary | orange | blue | green | purple |
