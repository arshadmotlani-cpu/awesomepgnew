# APG OS — Admin Panel brand (production)

**Status:** Live on admin shell. Preview: `/brand/apgos`. Vault: `docs/BRANDING/apg-os.md`.

## Icon sizes (SVG)

| File | Size |
|------|------|
| `public/admin-os/favicon-16.svg` | 16 |
| `public/admin-os/favicon-32.svg` | 32 |
| `public/admin-os/icon-512.svg` | 512 |
| `public/admin-os/apple-touch-icon.svg` | 180 |

## Approved identity

Concept **02-sentinel-shield** — `docs/qa/apg-os-concepts/`

## Tokens

- TypeScript: `src/lib/brand/apgOsTokens.ts` → `APG_OS_BRAND`
- CSS: `src/styles/apg-os-tokens.css`
- Metadata: `src/lib/brand/apgOsAdminMetadata.ts`

## Shell checklist

- [x] Sidebar / mobile header → APG OS lockup
- [x] Login + password routes → `AdminLoginShell`
- [x] Tab title template → `%s · APG OS`
- [x] Favicon / manifest / OG → `/admin-os/`
- [ ] Admin **in-app** orange CTAs → deferred token migration
