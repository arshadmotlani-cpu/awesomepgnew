# Awesome PG — Brand System

Official design system for the **Awesome PG product family**. Code SSOT lives in `src/lib/brand/`; static assets in `public/{awesome-pg,admin-os,capital,fyh}/`.

## Products

| Product | Primary | Route group | Preview |
|---------|---------|-------------|---------|
| Awesome PG (customer) | Orange `#FF5A1F` | Main site | `/brand/awesomepg` |
| APG OS (admin) | Blue `#2563EB` | `/admin` | `/brand/apgos` |
| Capital OS | Green `#16A34A` | Capital host / `/capital` | `/brand/capital` |
| For Your Hair ERP | Purple `#7C3AED` (mark) | FYH host / `/fyh` | `/brand/fyhair` |

## Documentation

- [Shared family rules](./shared.md)
- [Awesome PG](./awesome-pg.md)
- [APG OS](./apg-os.md)
- [Capital OS](./capital-os.md)
- [For Your Hair ERP](./for-your-hair.md)
- [Assets manifest](./assets-manifest.md)

## Export pipeline

```bash
# Rasterize SVG masters → PNG (requires sharp)
node scripts/export-brand-from-svg.mjs

# Legacy PNG masters (external 1024 sources)
node scripts/export-brand-icons.mjs
```

## QA

- Local previews: `/brand/*`
- Production smoke: `node scripts/verify-branding-prod.mjs`
- Screenshots: `node scripts/capture-branding.mjs`

## Do not

- Change business logic, APIs, or database schema for branding work
- Use one product’s primary color as another product’s shell accent
- Ship customer PWA with admin `start_url`
