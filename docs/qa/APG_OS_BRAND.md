# APG OS — Admin Panel brand (production)

**Status:** Live on admin shell. Preview: `/brand/apgos`. Vault: `docs/BRANDING/apg-os.md`.

## Icon sizes

| File | Size |
|------|------|
| `public/admin-os/pg-admin-mark.png` | 512×462 (canonical mark) |
| `public/admin-os/favicon-16.png` | 16 |
| `public/admin-os/favicon-32.png` | 32 |
| `public/admin-os/icon-512.png` | 512 |
| `public/admin-os/apple-touch-icon.png` | 180 |

## Approved identity

Final interlocking **PG** mark (reference PNG). Sentinel-shield concept is retired.

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
