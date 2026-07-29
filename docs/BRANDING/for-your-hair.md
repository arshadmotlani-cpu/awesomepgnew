# For Your Hair ERP

## Purpose

Luxury salon ERP.

## Brand mark (purple)

- Primary mark: `#7C3AED`
- Soft: `#A78BFA`
- Used for: favicons, PWA, login mark, sidebar icon, metadata `themeColor`

## App UI (unchanged this sprint)

Forest + gold chrome remains in `src/hair/styles/globals.css` for in-app surfaces. Purple applies to **brand mark and browser metadata only** until a later UI recolor pass.

## Feel

Elegant · Luxury · Beauty · Premium

## Symbol

FY monogram in rounded square (purple field, light letterforms).

## Logo usage

- Login: `FyhLoginBrandHeader`
- Sidebar: `FyhSidebarBrand`
- Minimum mark: 16px — use bold monogram strokes

## Do

- Ship manifest + icons under `public/fyh/`
- Keep Cormorant + Outfit for UI typography

## Don’t

- Recolor entire FYH app to purple in this sprint
- Use generic `UserRound` placeholder where mark component exists

## Code

- Tokens: `src/lib/brand/fyhBrandTokens.ts`
- Metadata: `src/lib/brand/fyhMetadata.ts`
- Assets: `public/fyh/`
